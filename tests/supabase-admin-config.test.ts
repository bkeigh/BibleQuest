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
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: { fetch: expect.any(Function) },
      }),
    );

    const options = mocks.createClient.mock.calls[0]?.[2];
    const transport = options.global.fetch as typeof fetch;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    await transport("https://fixture.supabase.co/rest/v1/probe", {
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
      },
    });
    const forwarded = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(forwarded.get("apikey")).toBe(secret);
    expect(forwarded.has("authorization")).toBe(false);
    fetchMock.mockRestore();
  });

  it("rejects a legacy JWT placed in the modern Production variable", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", `eyJ${"a".repeat(64)}`);
    const { createAdminSupabase } = await import(
      "@/lib/supabase/admin.server"
    );

    expect(() => createAdminSupabase()).toThrow(
      "Supabase admin configuration unavailable",
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
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
