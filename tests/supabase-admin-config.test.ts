import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

describe("Supabase admin configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.createClient.mockReset();
    mocks.createClient.mockReturnValue({ auth: {} });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      `sb_publishable_${"p".repeat(32)}`,
    );
  });

  it("uses the independently rotatable secret key in production", async () => {
    const secret = `sb_secret_${"s".repeat(48)}`;
    vi.stubEnv("SUPABASE_SECRET_KEY", secret);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-service-role-key".repeat(2));
    const { createAdminSupabase } = await import(
      "@/lib/supabase/admin.server"
    );

    createAdminSupabase();
    expect(mocks.createClient).toHaveBeenCalledWith(
      "https://fixture.supabase.co",
      secret,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  });

  it("rejects the legacy service-role fallback in production", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "s".repeat(48));
    const { createAdminSupabase } = await import(
      "@/lib/supabase/admin.server"
    );

    expect(() => createAdminSupabase()).toThrow(
      "Supabase admin configuration unavailable",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
