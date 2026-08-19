import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listUsers: vi.fn() }));

vi.mock("@/lib/supabase/admin.server", () => ({
  createAdminSupabase: () => ({ auth: { admin: { listUsers: mocks.listUsers } } }),
}));
vi.mock("@/lib/observability/server-failures", () => ({
  recordServerFailure: vi.fn(),
}));

import { GET } from "@/app/api/health/signin/route";

const SECRET = "s".repeat(48);

function request(authorization?: string, url = "https://www.biblequest.co/api/health/signin") {
  return new Request(url, {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("SIGNIN_HEALTH_SECRET", SECRET);
  mocks.listUsers.mockResolvedValue({
    data: { users: [{ created_at: new Date().toISOString() }] },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health/signin", () => {
  it("refuses a caller without the shared secret", async () => {
    // The report counts real people. On a public repository the monitor token
    // is the only thing between this and anyone who finds the URL.
    for (const header of [undefined, "Bearer wrong", "Basic something", SECRET]) {
      const response = await GET(request(header));
      expect(response.status, String(header)).toBe(401);
    }
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("refuses everyone when the secret is unset or too short to be real", async () => {
    for (const value of ["", "short"]) {
      vi.stubEnv("SIGNIN_HEALTH_SECRET", value);
      const response = await GET(request(`Bearer ${value}`));
      expect(response.status, value).toBe(401);
    }
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("reports counts to an authorised caller and never identities", async () => {
    mocks.listUsers.mockResolvedValue({
      data: {
        users: [
          { created_at: new Date().toISOString(), email: "someone@example.com", id: "abc" },
          {
            created_at: new Date(Date.now() - 90 * 86_400_000).toISOString(),
            last_sign_in_at: new Date().toISOString(),
            email: "other@example.com",
          },
        ],
      },
      error: null,
    });

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      contract: "biblequest_signin_health_v1",
      totalUsers: 2,
      neverSignedIn: 1,
      newlyStuck: 1,
      ok: false,
    });
    // No address, id, or other identifier may cross this boundary.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/someone@example\.com|other@example\.com|abc/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers unavailable rather than ok when the user list cannot be read", async () => {
    mocks.listUsers.mockResolvedValue({ data: null, error: { message: "boom" } });
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
  });
});
