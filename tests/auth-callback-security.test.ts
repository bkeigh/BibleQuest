import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

// Exercise the route boundary without requiring Next's server-only runtime.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/sync/containment", () => ({
  accountSyncAvailable: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: mocks.createServerSupabase,
  isSupabaseConfigured: () => true,
}));

import { GET } from "@/app/auth/callback/route";

describe("auth callback session binding", () => {
  beforeEach(() => {
    mocks.createServerSupabase.mockReset();
    mocks.exchangeCodeForSession.mockReset();
    mocks.createServerSupabase.mockResolvedValue({
      auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
    });
  });

  it("rejects portable bearer links before creating a Supabase client", async () => {
    const response = await GET(
      new Request(
        "https://www.biblequest.co/auth/callback" +
          "?token_hash=attacker-owned&type=email&next=%2Fapp",
      ),
    );

    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.biblequest.co/app/account?error=invalid",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("still completes a browser-bound PKCE authorization code", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { email: "reader@example.com" } },
      error: null,
    });

    const response = await GET(
      new Request(
        "https://www.biblequest.co/auth/callback?code=pkce-code&next=%2Fapp",
      ),
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.biblequest.co/app",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "biblequest_auth_completed=1",
    );
  });
});
