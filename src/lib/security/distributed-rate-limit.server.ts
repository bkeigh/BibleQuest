import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordServerFailure } from "@/lib/observability/server-failures";
import { createAdminSupabase } from "@/lib/supabase/admin.server";

export interface DistributedRateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

/** Converts millisecond-windowed guard policies to the distributed limiter shape. */
export function distributedPoliciesFromWindows(
  policies: readonly { limit: number; windowMs: number }[],
): DistributedRateLimitPolicy[] {
  return policies.map(({ limit, windowMs }) => ({
    limit,
    windowSeconds: windowMs / 1_000,
  }));
}

interface RateLimitClaim {
  allowed: boolean;
  retryAfter: number;
}

/** Separates "this deployment is misconfigured" from "the claim store failed". */
export class DistributedRateLimitError extends Error {
  readonly reason: "configuration" | "dependency" | "invalid";

  constructor(reason: DistributedRateLimitError["reason"]) {
    super(`Distributed rate limit unavailable: ${reason}.`);
    this.name = "DistributedRateLimitError";
    this.reason = reason;
  }
}

// Accepts only the bounded response emitted by the service-only database RPC.
function parseClaim(value: unknown): RateLimitClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DistributedRateLimitError("invalid");
  }
  const claim = value as { allowed?: unknown; retry_after?: unknown };
  if (
    typeof claim.allowed !== "boolean" ||
    !Number.isInteger(claim.retry_after) ||
    Number(claim.retry_after) < 1 ||
    Number(claim.retry_after) > 86_400
  ) {
    throw new DistributedRateLimitError("invalid");
  }
  return {
    allowed: claim.allowed,
    retryAfter: Number(claim.retry_after),
  };
}

// Derives an opaque bucket with a dedicated secret so database-key rotation is isolated.
function bucketHash(identity: string) {
  const secret =
    process.env.BIBLEQUEST_RATE_LIMIT_SECRET?.trim() ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (!secret || secret.length < 32) {
    throw new DistributedRateLimitError("configuration");
  }
  return createHmac("sha256", secret)
    .update(`biblequest-provider-rate:v1:${identity}`)
    .digest("hex");
}

// Trusts the forwarding address only on Vercel, which overwrites this header.
function trustedRequestIdentity(request: Request) {
  if (process.env.VERCEL !== "1") return "network:unknown";
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown")
    .split(",", 1)[0]
    .trim()
    .slice(0, 128);
  return `network:${ip || "unknown"}`;
}

// Returns a private response without disclosing counters or database details.
function privateRateResponse(error: string, status: number, retryAfter?: number) {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    },
  );
}

// Claims each window through one service-only, atomic Postgres function.
export async function claimDistributedRateLimits(
  admin: SupabaseClient,
  scope: string,
  identity: string,
  policies: readonly DistributedRateLimitPolicy[],
): Promise<RateLimitClaim> {
  const opaqueBucket = bucketHash(identity);
  let retryAfter = 1;
  for (const policy of policies) {
    const { data, error } = await admin.rpc("claim_provider_rate_limit", {
      p_scope: scope,
      p_bucket_hash: opaqueBucket,
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
    });
    if (error) {
      // Name what the database actually said. "dependency" alone is how this
      // failure looked in production for an unknown length of time: a 503 on
      // every rate-limited route, with nothing to distinguish a revoked key
      // from a missing grant from an outage. PostgREST error payloads carry a
      // code, a message and no credential, so record them bounded.
      console.error(
        JSON.stringify({
          kind: "rate_limit_claim_refusal",
          scope,
          code: typeof error.code === "string" ? error.code : "",
          message: String(error.message ?? "").slice(0, 200),
        }),
      );
      throw new DistributedRateLimitError("dependency");
    }
    const claim = parseClaim(data);
    retryAfter = Math.max(retryAfter, claim.retryAfter);
    if (!claim.allowed) return { allowed: false, retryAfter: claim.retryAfter };
  }
  return { allowed: true, retryAfter };
}

/** Fails closed when the shared claim is unavailable or the bucket is exhausted. */
export async function guardDistributedRequest(
  request: Request,
  scope: string,
  policies: readonly DistributedRateLimitPolicy[],
  accountId?: string,
): Promise<Response | null> {
  try {
    const claim = await claimDistributedRateLimits(
      createAdminSupabase(),
      scope,
      accountId ? `account:${accountId}` : trustedRequestIdentity(request),
      policies,
    );
    if (claim.allowed) return null;
    return privateRateResponse("rate_limited", 429, claim.retryAfter);
  } catch (error) {
    // Failing closed without a signal makes a missing rate-limit secret look
    // exactly like a database outage, so record the bounded reason.
    recordServerFailure("rate_limit", "claim", error);
    return privateRateResponse("rate_limit_unavailable", 503);
  }
}
