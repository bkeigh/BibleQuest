import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
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

// Accepts only the bounded response emitted by the service-only database RPC.
function parseClaim(value: unknown): RateLimitClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Distributed rate limit unavailable.");
  }
  const claim = value as { allowed?: unknown; retry_after?: unknown };
  if (
    typeof claim.allowed !== "boolean" ||
    !Number.isInteger(claim.retry_after) ||
    Number(claim.retry_after) < 1 ||
    Number(claim.retry_after) > 86_400
  ) {
    throw new Error("Distributed rate limit unavailable.");
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
    throw new Error("Distributed rate limit unavailable.");
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
    if (error) throw new Error("Distributed rate limit unavailable.");
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
  } catch {
    return privateRateResponse("rate_limit_unavailable", 503);
  }
}
