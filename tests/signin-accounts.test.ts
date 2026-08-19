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
  it("keeps a modern secret key out of the bearer channel", () => {
    // sb_secret_… is not a JWT. Putting it in Authorization is exactly what the
    // admin client's fetch wrapper exists to prevent, and getting this wrong is
    // why the first production run answered 503 with nothing to say.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", MODERN);
    const seen = stubFetch(() => new Response(JSON.stringify({ users: [] }), { status: 200 }));

    return listSigninAccounts().then(() => {
      expect(seen[0].get("apikey")).toBe(MODERN);
      expect(seen[0].get("authorization")).toBeNull();
    });
  });

  it("still sends a legacy service-role JWT as a bearer", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", LEGACY);
    const seen = stubFetch(() => new Response(JSON.stringify({ users: [] }), { status: 200 }));

    return listSigninAccounts().then(() => {
      expect(seen[0].get("apikey")).toBe(LEGACY);
      expect(seen[0].get("authorization")).toBe(`Bearer ${LEGACY}`);
    });
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
