import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SigninAccountsError,
  listSigninAccounts,
} from "@/lib/observability/signin-accounts.server";

const MODERN = `sb_secret_${"k".repeat(40)}`;
const LEGACY = `eyJ${"j".repeat(60)}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubFetch(handler: (headers: Headers, url: string) => Response) {
  const seen: Headers[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      seen.push(headers);
      return handler(headers, String(url));
    }),
  );
  return seen;
}

describe("listSigninAccounts", () => {
  it("sends a modern secret key on apikey alone, never as a bearer", () => {
    // A secret key is not a JWT. The bearer channel rejects it, and the one
    // documented exception — a bearer equal to the apikey header — only gets
    // the request forwarded, then "rejected as the value is not a JWT". A
    // previous revision read that as permission to send both and shipped a
    // third failing header shape.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", MODERN);
    const seen = stubFetch(() => new Response(JSON.stringify({ users: [] }), { status: 200 }));

    return listSigninAccounts().then(() => {
      expect(seen[0].get("apikey")).toBe(MODERN);
      expect(seen[0].get("authorization")).toBeNull();
    });
  });

  it("still carries a legacy service-role JWT in both channels", () => {
    // The legacy key IS a JWT, so the bearer channel is exactly where it
    // belongs. The classes genuinely differ; that is the whole reason this
    // module branches at all.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", LEGACY);
    const seen = stubFetch(() => new Response(JSON.stringify({ users: [] }), { status: 200 }));

    return listSigninAccounts().then(() => {
      expect(seen[0].get("apikey")).toBe(LEGACY);
      expect(seen[0].get("authorization")).toBe(`Bearer ${LEGACY}`);
    });
  });

  it("records what the upstream refused with, and never the key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", MODERN);
    const logged: string[] = [];
    const error = vi
      .spyOn(console, "error")
      .mockImplementation((line: unknown) => void logged.push(String(line)));
    stubFetch(
      () =>
        new Response(
          JSON.stringify({ error_code: "user_not_allowed", msg: "User not allowed" }),
          { status: 403 },
        ),
    );

    await expect(listSigninAccounts()).rejects.toMatchObject({ reason: "permission" });
    error.mockRestore();

    const refusal = logged.find((line) => line.includes("signin_admin_refusal"));
    expect(refusal, "the refusal must describe itself").toBeDefined();
    expect(refusal).toContain("user_not_allowed");
    expect(refusal).toContain("sb_secret");
    // The class travels; the credential does not.
    expect(refusal).not.toContain(MODERN);
    expect(logged.join("\n")).not.toContain(MODERN);
  });

  it("names why it failed rather than reporting unknown", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", MODERN);
    for (const [status, reason] of [
      [401, "auth"],
      [403, "permission"],
      [500, "provider"],
    ] as const) {
      stubFetch(() => new Response("{}", { status }));
      await expect(listSigninAccounts(), String(status)).rejects.toMatchObject({
        reason,
      });
      vi.unstubAllGlobals();
    }
  });

  it("reports missing configuration instead of calling out with nothing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const seen = stubFetch(() => new Response("{}", { status: 200 }));

    await expect(listSigninAccounts()).rejects.toBeInstanceOf(SigninAccountsError);
    expect(seen, "no request may leave without a key").toHaveLength(0);
  });

  it("pages until a short page and keeps only the two fields it needs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", MODERN);
    let call = 0;
    stubFetch(() => {
      call += 1;
      const users =
        call === 1
          ? Array.from({ length: 200 }, () => ({
              created_at: "2026-08-01T00:00:00.000Z",
              email: "person@example.com",
              id: "identifier",
            }))
          : [{ created_at: "2026-08-02T00:00:00.000Z", last_sign_in_at: "2026-08-03T00:00:00.000Z" }];
      return new Response(JSON.stringify({ users }), { status: 200 });
    });

    const accounts = await listSigninAccounts();

    expect(call).toBe(2);
    expect(accounts).toHaveLength(201);
    // Identities must not travel further than this function.
    expect(JSON.stringify(accounts)).not.toMatch(/person@example\.com|identifier/);
  });
});
