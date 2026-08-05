import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsedBearerToken } from "@/lib/http/bearer-token";
import { NATIVE_APP_ORIGIN } from "@/lib/http/native-origin";

const LATCH = "BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED";

// A realistic GoTrue-shaped token: three base64url segments, ~1.5 KB total,
// so metadata growth toward the bound is exercised rather than only synthetic
// short strings.
const SEGMENT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
const TOKEN = `${SEGMENT}.${"a1-_".repeat(340)}.${SEGMENT}`;

function req(origin: string | null, authorization?: string) {
  const headers = new Headers({ host: "www.biblequest.co" });
  if (origin !== null) headers.set("origin", origin);
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://www.biblequest.co/api/arcade/status", {
    headers,
  });
}

afterEach(() => {
  delete process.env[LATCH];
  vi.resetModules();
  vi.doUnmock("@supabase/supabase-js");
});

describe("parsedBearerToken", () => {
  it("accepts a realistic bearer JWT, scheme case-insensitively", () => {
    expect(parsedBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(parsedBearerToken(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(parsedBearerToken(`BEARER ${TOKEN}`)).toBe(TOKEN);
  });

  it("rejects everything that is not exactly one three-segment token", () => {
    for (const header of [
      null,
      "",
      "Bearer",
      "Bearer ",
      TOKEN, // missing scheme
      `Basic ${TOKEN}`,
      "Bearer a.b", // one dot
      "Bearer abc", // zero dots
      "Bearer a.b.c.d", // three dots
      "Bearer a+b.c.d", // + is base64, not base64url
      "Bearer a/b.c.d", // / likewise
      "Bearer a=.b.c", // padding
      "Bearer a.b .c", // interior whitespace
      `Bearer  ${TOKEN}`, // two spaces — RFC 6750 allows exactly one
      `Bearer ${TOKEN} ${TOKEN}`, // two tokens
      // What Headers.get returns for a smuggled duplicate header pair — the
      // join must stay fail-closed against any future lenient comma split.
      `Bearer a.b.c, Bearer a.b.c`,
    ]) {
      expect(parsedBearerToken(header)).toBeNull();
    }
  });

  it("bounds the header length", () => {
    const oversized = `Bearer a.b.${"c".repeat(4096)}`;
    expect(parsedBearerToken(oversized)).toBeNull();
    expect(parsedBearerToken(`Bearer ${TOKEN}`)).not.toBeNull();
  });
});

describe("the native bearer branch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function context(request: Request) {
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );
    return authenticatedServerContext(request);
  }

  it("returns 401 for a native-origin request with no token", async () => {
    process.env[LATCH] = "true";
    // Reaching the cookie factory here would throw (no next/headers request
    // scope in this suite), so a clean 401 also proves the branch never
    // touches it.
    const result = await context(req(NATIVE_APP_ORIGIN));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    await expect((result as Response).json()).resolves.toEqual({
      error: "unauthorized",
    });
  });

  it("returns 401 for a malformed token without falling back", async () => {
    process.env[LATCH] = "true";
    for (const header of ["Bearer nope", `Basic ${TOKEN}`, "Bearer a.b"]) {
      const result = await context(req(NATIVE_APP_ORIGIN, header));
      expect((result as Response).status).toBe(401);
    }
  });

  it("returns 503 for a shaped token when Supabase is unconfigured", async () => {
    process.env[LATCH] = "true";
    const result = await context(req(NATIVE_APP_ORIGIN, `Bearer ${TOKEN}`));
    expect((result as Response).status).toBe(503);
    await expect((result as Response).json()).resolves.toEqual({
      error: "unavailable",
    });
  });

  it("ignores the Authorization header entirely while the latch is off", async () => {
    // Latch off is production today: a bearer header must change nothing.
    // Both requests take the cookie path, which fails identically in this
    // unconfigured environment.
    const withHeader = await context(req(NATIVE_APP_ORIGIN, `Bearer ${TOKEN}`));
    const withoutHeader = await context(req(NATIVE_APP_ORIGIN));
    expect((withHeader as Response).status).toBe(
      (withoutHeader as Response).status,
    );
    await expect((withHeader as Response).json()).resolves.toEqual(
      await (withoutHeader as Response).json(),
    );
  });
});

describe("the bearer client construction", () => {
  const SUPABASE_URL = "https://bearer-fixture.supabase.co";
  const SUPABASE_KEY = "bearer-fixture-publishable-key";

  beforeEach(() => {
    vi.resetModules();
    process.env[LATCH] = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = SUPABASE_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  async function mockedContext(
    getUser: ReturnType<typeof vi.fn>,
    authorization = `Bearer ${TOKEN}`,
  ) {
    const createClient = vi.fn(() => ({ auth: { getUser } }));
    vi.doMock("@supabase/supabase-js", async () => {
      const actual = await vi.importActual("@supabase/supabase-js");
      return { ...actual, createClient };
    });
    const { authenticatedServerContext } = await import(
      "@/lib/supabase/authenticated.server"
    );
    const result = await authenticatedServerContext(
      req(NATIVE_APP_ORIGIN, authorization),
    );
    return { createClient, getUser, result };
  }

  it("verifies the exact presented token and returns the bearer client", async () => {
    const user = { id: "0be7…fixture" };
    const getUser = vi.fn(async () => ({ data: { user }, error: null }));
    const { createClient, result } = await mockedContext(getUser);

    // The explicit-jwt call is the verification; an argless getUser would
    // read the client's own (empty) session instead.
    expect(getUser).toHaveBeenCalledWith(TOKEN);

    expect(result).not.toBeInstanceOf(Response);
    const context = result as { supabase: unknown; user: unknown };
    expect(context.user).toBe(user);
    // The avatar trap: context.supabase must BE the bearer client, because
    // its RPCs read auth.uid() from the attached JWT.
    expect(context.supabase).toBe(createClient.mock.results[0]?.value);

    const [url, key, options] = createClient.mock.calls[0] as unknown as [
      string,
      string,
      {
        auth: Record<string, unknown>;
        global: { headers: Record<string, string> };
      },
    ];
    expect(url).toBe(SUPABASE_URL);
    expect(key).toBe(SUPABASE_KEY);
    expect(options.auth).toEqual({
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    });
    // Exact own-property check, deliberately case-sensitive: supabase-js
    // spreads header objects case-sensitively over its own Authorization
    // default, so a lowercase key would send both values.
    expect(options.global.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(Object.keys(options.global.headers)).toEqual(["Authorization"]);
  });

  it("returns 401 when verification rejects the token", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: Object.assign(new Error("invalid"), { status: 401 }),
    }));
    const { result } = await mockedContext(getUser);
    expect((result as Response).status).toBe(401);
  });

  it("returns 401 when verification yields no user", async () => {
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: null,
    }));
    const { result } = await mockedContext(getUser);
    expect((result as Response).status).toBe(401);
  });
});
