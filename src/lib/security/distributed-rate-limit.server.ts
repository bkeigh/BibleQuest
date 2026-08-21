import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyServerFailure,
  recordServerFailure,
} from "@/lib/observability/server-failures";
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

/** Names the only anonymous read-only routes allowed to use local fallback. */
export type GuestBibleReadScope =
  | "bible-chapter"
  | "bible-passage"
  | "bible-translations";

/** Enforces the guest-read allowlist at runtime as well as compile time. */
const GUEST_BIBLE_READ_SCOPES = new Set<GuestBibleReadScope>([
  "bible-chapter",
  "bible-passage",
  "bible-translations",
]);

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

/** Records a database refusal using fixed values instead of provider text. */
function recordDistributedClaimRefusal(error: unknown): void {
  console.error(
    JSON.stringify({
      kind: "rate_limit_claim_refusal",
      reason: classifyServerFailure(error),
    }),
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
    try {
      const { data, error } = await admin.rpc("claim_provider_rate_limit", {
        p_scope: scope,
        p_bucket_hash: opaqueBucket,
        p_limit: policy.limit,
        p_window_seconds: policy.windowSeconds,
      });
      if (error) {
        // Any RPC refusal means the shared claim dependency did not answer,
        // including the invalid-admin-key outage this fallback must survive.
        // PostgreSQL 22023 instead names our own malformed claim contract and
        // must remain fail-closed rather than borrowing the local fallback.
        recordDistributedClaimRefusal(error);
        const reason =
          typeof error.code === "string" && error.code === "22023"
            ? "invalid"
            : "dependency";
        throw new DistributedRateLimitError(reason);
      }
      const claim = parseClaim(data);
      retryAfter = Math.max(retryAfter, claim.retryAfter);
      if (!claim.allowed) {
        return { allowed: false, retryAfter: claim.retryAfter };
      }
    } catch (error) {
      // Network rejection is a dependency failure; reviewed claim errors keep
      // their narrower reason so invalid data can never trigger the fallback.
      if (error instanceof DistributedRateLimitError) throw error;
      throw new DistributedRateLimitError("dependency");
    }
  }
  return { allowed: true, retryAfter };
}

/** Returns the shared-limit response while allowing typed failures to escape. */
async function distributedRateLimitResponse(
  request: Request,
  scope: string,
  policies: readonly DistributedRateLimitPolicy[],
  accountId?: string,
): Promise<Response | null> {
  const claim = await claimDistributedRateLimits(
    createAdminSupabase(),
    scope,
    accountId ? `account:${accountId}` : trustedRequestIdentity(request),
    policies,
  );
  if (claim.allowed) return null;
  return privateRateResponse("rate_limited", 429, claim.retryAfter);
}

/** Fails closed when the shared claim is unavailable or the bucket is exhausted. */
export async function guardDistributedRequest(
  request: Request,
  scope: string,
  policies: readonly DistributedRateLimitPolicy[],
  accountId?: string,
): Promise<Response | null> {
  try {
    return await distributedRateLimitResponse(
      request,
      scope,
      policies,
      accountId,
    );
  } catch (error) {
    // Failing closed without a signal makes a missing rate-limit secret look
    // exactly like a database outage, so record the bounded reason.
    recordServerFailure("rate_limit", "claim", error);
    return privateRateResponse("rate_limit_unavailable", 503);
  }
}

/**
 * Lets a validated guest Bible GET use its already-applied local limit only
 * when the shared limiter's dependency fails. Every other failure stays closed.
 */
export async function guardGuestBibleReadDistributedRequest(
  request: Request,
  scope: GuestBibleReadScope,
  policies: readonly DistributedRateLimitPolicy[],
): Promise<Response | null> {
  if (request.method !== "GET" || !GUEST_BIBLE_READ_SCOPES.has(scope)) {
    const error = new DistributedRateLimitError("configuration");
    recordServerFailure("rate_limit", "claim", error);
    return privateRateResponse("rate_limit_unavailable", 503);
  }

  try {
    return await distributedRateLimitResponse(request, scope, policies);
  } catch (error) {
    // The route has already consumed its bounded local window before this call.
    recordServerFailure("rate_limit", "claim", error);
    if (
      error instanceof DistributedRateLimitError &&
      error.reason === "dependency"
    ) {
      return null;
    }
    return privateRateResponse("rate_limit_unavailable", 503);
  }
}
