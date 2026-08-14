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

  it("routes a customer PKCE code through a fragment without server exchange", async () => {
    const response = await GET(
      new Request(
        "https://www.biblequest.co/auth/callback?code=pkce-code&next=%2Fapp",
      ),
    );

    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.biblequest.co/auth/customer-callback#code=pkce-code&next=%2Fapp",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects oversized or control-bearing customer codes before routing", async () => {
    const oversized = "a".repeat(4_097);
    const responses = await Promise.all([
      GET(
        new Request(
          `https://www.biblequest.co/auth/callback?code=${oversized}&next=%2Fapp`,
        ),
      ),
      GET(
        new Request(
          "https://www.biblequest.co/auth/callback?code=line%0Abreak&next=%2Fapp",
        ),
      ),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://www.biblequest.co/app/account?error=invalid",
      );
    }
    expect(mocks.createServerSupabase).not.toHaveBeenCalled();
  });
});
