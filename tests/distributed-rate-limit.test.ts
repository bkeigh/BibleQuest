import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimDistributedRateLimits } from "@/lib/security/distributed-rate-limit.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Creates only the RPC surface exercised by the service-only claim helper.
function adminWithClaims(...claims: unknown[]) {
  const rpc = vi.fn();
  for (const claim of claims) {
    rpc.mockResolvedValueOnce({ data: claim, error: null });
  }
  return { admin: { rpc } as unknown as SupabaseClient, rpc };
}

describe("distributed provider rate limits", () => {
  it("claims every shared window with an opaque stable bucket", async () => {
    vi.stubEnv("BIBLEQUEST_RATE_LIMIT_SECRET", "r".repeat(48));
    const { admin, rpc } = adminWithClaims(
      { allowed: true, retry_after: 30, remaining: 2 },
      { allowed: true, retry_after: 3_000, remaining: 10 },
    );

    await expect(
      claimDistributedRateLimits(admin, "ai-shepherd", "account:user-a", [
        { limit: 3, windowSeconds: 60 },
        { limit: 16, windowSeconds: 86_400 },
      ]),
    ).resolves.toEqual({ allowed: true, retryAfter: 3_000 });

    expect(rpc).toHaveBeenCalledTimes(2);
    const firstClaim = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(firstClaim.p_bucket_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstClaim.p_bucket_hash).not.toContain("user-a");
  });

  it("names what the database refused with, and never the credential", async () => {
    // Production answered 503 on every rate-limited route with nothing but
    // reason "dependency" — a revoked key, a missing grant and an outage all
    // looked identical. PostgREST hands back a code and a message and no
    // credential, so both belong in the log.
    vi.stubEnv("BIBLEQUEST_RATE_LIMIT_SECRET", "r".repeat(48));
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation(
      (line: unknown) => void logged.push(String(line)),
    );
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    });
    const admin = { rpc } as unknown as SupabaseClient;

    await expect(
      claimDistributedRateLimits(admin, "ai-shepherd", "account:user-a", [
        { limit: 3, windowSeconds: 60 },
      ]),
    ).rejects.toMatchObject({ reason: "dependency" });

    const line = logged.find((l) => l.includes("rate_limit_claim_refusal"));
    expect(line, "the refusal must describe itself").toBeDefined();
    expect(line).toContain("42501");
    expect(line).toContain("permission denied for function");
    expect(line).toContain("ai-shepherd");
    // The bucket hash is derived from the identity and the secret; neither
    // the secret nor the raw identity may ride along in the log.
    expect(line).not.toContain("user-a");
    expect(line).not.toContain("r".repeat(48));
  });

  it("stops after a denied window and preserves its retry interval", async () => {
    vi.stubEnv("BIBLEQUEST_RATE_LIMIT_SECRET", "r".repeat(48));
    const { admin, rpc } = adminWithClaims({
      allowed: false,
      retry_after: 42,
      remaining: 0,
    });

    await expect(
      claimDistributedRateLimits(admin, "support-checkout", "network:test", [
        { limit: 5, windowSeconds: 600 },
        { limit: 20, windowSeconds: 86_400 },
      ]),
    ).resolves.toEqual({ allowed: false, retryAfter: 42 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed database responses", async () => {
    vi.stubEnv("BIBLEQUEST_RATE_LIMIT_SECRET", "r".repeat(48));
    const { admin } = adminWithClaims({ allowed: "yes", retry_after: 0 });

    await expect(
      claimDistributedRateLimits(admin, "ai-quest", "account:user-a", [
        { limit: 4, windowSeconds: 60 },
      ]),
    ).rejects.toThrow("Distributed rate limit unavailable");
  });

  it("does not reuse the database credential in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BIBLEQUEST_RATE_LIMIT_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(48));
    const { admin } = adminWithClaims({ allowed: true, retry_after: 30 });

    await expect(
      claimDistributedRateLimits(admin, "ai-quest", "account:user-a", [
        { limit: 4, windowSeconds: 60 },
      ]),
    ).rejects.toThrow("Distributed rate limit unavailable");
  });
});
