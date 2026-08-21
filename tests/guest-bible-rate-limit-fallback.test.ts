import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));
vi.mock("@/lib/observability/server-failures", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/observability/server-failures")
  >()),
  recordServerFailure: mocks.recordFailure,
}));

import {
  guardDistributedRequest,
  guardGuestBibleReadDistributedRequest,
} from "@/lib/security/distributed-rate-limit.server";
import { GET as listBibleTranslations } from "@/app/api/bible/translations/route";

const POLICIES = [{ limit: 2, windowSeconds: 60 }] as const;

/** Builds an anonymous request without exposing its network identity to logs. */
function request(method = "GET") {
  return new Request("https://biblequest.test/api/bible/chapter", {
    method,
    headers: { "x-forwarded-for": "198.51.100.42" },
  });
}

/** Creates only the shared rate-limit RPC used by the guard. */
function adminWithResult(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  mocks.createAdmin.mockReturnValue({ rpc } as unknown as SupabaseClient);
  return rpc;
}

beforeEach(() => {
  vi.stubEnv("BIBLEQUEST_RATE_LIMIT_SECRET", "r".repeat(48));
  vi.stubEnv("VERCEL", "1");
  mocks.createAdmin.mockReset();
  mocks.recordFailure.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("guest Bible distributed rate-limit fallback", () => {
  it("keeps guest reading available but bounded by the local route window", async () => {
    const rpc = adminWithResult({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    });
    const makeRequest = () =>
      new Request("https://biblequest.test/api/bible/translations", {
        headers: {
          "sec-fetch-site": "same-origin",
          "x-forwarded-for": "198.51.100.77",
        },
      });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(listBibleTranslations(makeRequest())).resolves.toMatchObject({
        status: 200,
      });
    }
    await expect(listBibleTranslations(makeRequest())).resolves.toMatchObject({
      status: 429,
    });
    expect(rpc).toHaveBeenCalledTimes(10);
  });

  it("uses the already-applied local limit after a dependency failure", async () => {
    adminWithResult({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    });

    await expect(
      guardGuestBibleReadDistributedRequest(
        request(),
        "bible-chapter",
        POLICIES,
      ),
    ).resolves.toBeNull();

    expect(mocks.recordFailure).toHaveBeenCalledOnce();
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "rate_limit",
      "claim",
      expect.objectContaining({ reason: "dependency" }),
    );
    expect(JSON.stringify(mocks.recordFailure.mock.calls)).not.toContain(
      "198.51.100.42",
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "198.51.100.42",
    );
  });

  it("also falls back when the shared RPC rejects before returning", async () => {
    const rpc = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    mocks.createAdmin.mockReturnValue({ rpc } as unknown as SupabaseClient);

    await expect(
      guardGuestBibleReadDistributedRequest(
        request(),
        "bible-chapter",
        POLICIES,
      ),
    ).resolves.toBeNull();
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "rate_limit",
      "claim",
      expect.objectContaining({ reason: "dependency" }),
    );
  });

  it("keeps shared denials and malformed claims fail-closed", async () => {
    adminWithResult({
      data: { allowed: false, retry_after: 42 },
      error: null,
    });
    const denied = await guardGuestBibleReadDistributedRequest(
      request(),
      "bible-passage",
      POLICIES,
    );
    expect(denied?.status).toBe(429);
    expect(denied?.headers.get("retry-after")).toBe("42");

    adminWithResult({ data: { allowed: "yes" }, error: null });
    const malformed = await guardGuestBibleReadDistributedRequest(
      request(),
      "bible-translations",
      POLICIES,
    );
    expect(malformed?.status).toBe(503);
    await expect(malformed?.json()).resolves.toEqual({
      error: "rate_limit_unavailable",
    });
  });

  it("keeps database-rejected claim arguments fail-closed", async () => {
    adminWithResult({
      data: null,
      error: { code: "22023", message: "invalid rate limit claim" },
    });

    const blocked = await guardGuestBibleReadDistributedRequest(
      request(),
      "bible-chapter",
      POLICIES,
    );

    expect(blocked?.status).toBe(503);
    await expect(blocked?.json()).resolves.toEqual({
      error: "rate_limit_unavailable",
    });
  });

  it("rejects mutation methods before the admin dependency is contacted", async () => {
    const rpc = adminWithResult({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    });

    const blocked = await guardGuestBibleReadDistributedRequest(
      request("POST"),
      "bible-chapter",
      POLICIES,
    );

    expect(blocked?.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an unapproved scope before the admin dependency is contacted", async () => {
    const rpc = adminWithResult({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    });

    const blocked = await guardGuestBibleReadDistributedRequest(
      request(),
      // Proves the runtime allowlist still holds if JavaScript bypasses types.
      "support-checkout" as "bible-chapter",
      POLICIES,
    );

    expect(blocked?.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not treat local admin setup errors as dependency fallback", async () => {
    mocks.createAdmin.mockImplementation(() => {
      throw new TypeError("invalid local admin setup");
    });

    const blocked = await guardGuestBibleReadDistributedRequest(
      request(),
      "bible-chapter",
      POLICIES,
    );

    expect(blocked?.status).toBe(503);
    await expect(blocked?.json()).resolves.toEqual({
      error: "rate_limit_unavailable",
    });
  });

  it("leaves the general guard fail-closed on the same dependency failure", async () => {
    adminWithResult({
      data: null,
      error: { code: "42501", message: "permission denied for function" },
    });

    const blocked = await guardDistributedRequest(
      request("POST"),
      "support-checkout",
      POLICIES,
    );

    expect(blocked?.status).toBe(503);
    await expect(blocked?.json()).resolves.toEqual({
      error: "rate_limit_unavailable",
    });
  });
});
