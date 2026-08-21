import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

/**
 * These cases keep @supabase/supabase-js real on every customer auth path.
 * Only the fixture network and the browser attestation result are replaced.
 */
const mocks = vi.hoisted(() => ({
  requireAttestation: vi.fn(),
}));

vi.mock("@/lib/platform/web-auth-service-worker", () => ({
  requireWebAuthServiceWorkerAttestation: mocks.requireAttestation,
}));

import { requestIsolatedEmailOtp } from "@/lib/auth/email-otp-verification";
import { NATIVE_APP_ORIGIN } from "@/lib/http/native-origin";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";
import {
  createAccountSignOutClient,
  createClient,
  createEmailOtpVerificationClient,
} from "@/lib/supabase/client";
import {
  WEB_AUTH_V2_KEY,
  completeVerifiedWebOAuth,
  readWebAuthState,
  refreshRetainedDeletingWebSession,
  requireCurrentWebAccountRealm,
  withWebAccountOperationLock,
} from "@/lib/supabase/web-auth-storage";
import {
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
} from "@/lib/sync/native-beta-headers";
import {
  WEB_AUTH_PROTOCOL_HEADER,
  WEB_AUTH_PROTOCOL_VERSION,
} from "@/lib/supabase/web-auth-protocol";

const ORIGIN = "https://auth-surface-fixture.supabase.co";
const PUBLISHABLE_KEY = `sb_publishable_${"a".repeat(28)}`;
const EMAIL = "reader@fixture.invalid";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "11111111-2222-4333-8444-555555555555";
const ACCESS_TOKEN = [
  base64url({ alg: "HS256", typ: "JWT" }),
  base64url({
    sub: USER_ID,
    session_id: SESSION_ID,
    role: "authenticated",
    exp: 4_102_444_800,
  }),
  "Zml4dHVyZS1zaWduYXR1cmU",
].join(".");
const REFRESH_TOKEN = "fixture-refresh-token";

interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown>;
}

const recorded: RecordedRequest[] = [];

/** Encodes the unsigned JWT fixture fields that auth-js reads locally. */
function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Returns the smallest GoTrue-shaped session accepted by the real client. */
function verifiedSessionResponse(): Session {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    expires_in: 3_600,
    token_type: "bearer",
    user: {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: EMAIL,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2026-08-20T00:00:00.000Z",
    },
  } as unknown as Session;
}

/** Records a real supabase-js request and answers from the local fixture. */
async function authFixtureFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  const text = await request.clone().text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  recorded.push({
    url: request.url,
    method: request.method,
    headers: new Headers(request.headers),
    body,
  });

  if (request.url === `${ORIGIN}/auth/v1/otp`) {
    return Response.json({}, { status: 200 });
  }
  if (request.url === `${ORIGIN}/auth/v1/verify`) {
    return Response.json(verifiedSessionResponse(), { status: 200 });
  }
  if (request.url === `${ORIGIN}/auth/v1/token?grant_type=pkce`) {
    return Response.json(verifiedSessionResponse(), { status: 200 });
  }
  if (request.url === `${ORIGIN}/auth/v1/user`) {
    return Response.json(verifiedSessionResponse().user, { status: 200 });
  }
  if (
    request.url ===
    `${ORIGIN}/rest/v1/rpc/own_account_deletion_status`
  ) {
    return Response.json(
      {
        contract: "biblequest_account_deletion_status_v1",
        pending: false,
      },
      { status: 200 },
    );
  }
  if (request.url === `${ORIGIN}/rest/v1/rpc/auth_surface_fixture`) {
    return Response.json({ ok: true }, { status: 200 });
  }
  if (request.url === `${ORIGIN}/auth/v1/logout?scope=global`) {
    return new Response(null, { status: 204 });
  }
  return Response.json({ message: "unexpected fixture request" }, { status: 404 });
}

/** Removes the production singleton so no auth runtime crosses test cases. */
function clearBrowserClient(): void {
  delete (
    globalThis as typeof globalThis & {
      __biblequestSupabaseBrowserClient?: unknown;
    }
  ).__biblequestSupabaseBrowserClient;
}

/** Lists storage names without reading any stored credential value. */
function storageKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  ).filter((key): key is string => Boolean(key));
}

beforeEach(() => {
  recorded.length = 0;
  localStorage.clear();
  clearBrowserClient();
  mocks.requireAttestation.mockReset();
  mocks.requireAttestation.mockResolvedValue(undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGIN);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_APP_PLATFORM", "web");
  vi.stubEnv("BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED", "true");
  vi.stubGlobal("fetch", vi.fn(authFixtureFetch));
});

afterEach(() => {
  clearBrowserClient();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("customer auth surfaces with real supabase-js clients", () => {
  it("requests a returning user's email code with the isolated real client", async () => {
    const result = await requestIsolatedEmailOtp(EMAIL, false);

    expect(result.error).toBeNull();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      url: `${ORIGIN}/auth/v1/otp`,
      method: "POST",
      body: expect.objectContaining({
        email: EMAIL,
        create_user: false,
        code_challenge: expect.any(String),
        code_challenge_method: "s256",
      }),
    });
    expect(recorded[0]?.headers.get("apikey")).toBe(PUBLISHABLE_KEY);
    expect(recorded[0]?.headers.get("authorization")).toBe(
      `Bearer ${PUBLISHABLE_KEY}`,
    );
    expect(recorded[0]?.headers.get("x-biblequest-web-auth")).toBe("v2");
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBeNull();
  });

  it("verifies an email code through the isolated real client", async () => {
    const result = await createEmailOtpVerificationClient().auth.verifyOtp({
      email: EMAIL,
      token: "123456",
      type: "email",
    });

    expect(result.error).toBeNull();
    expect(result.data.user?.id).toBe(USER_ID);
    expect(result.data.session?.access_token).toBe(ACCESS_TOKEN);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      url: `${ORIGIN}/auth/v1/verify`,
      method: "POST",
      body: expect.objectContaining({
        email: EMAIL,
        token: "123456",
        type: "email",
      }),
    });
    expect(recorded[0]?.headers.get("apikey")).toBe(PUBLISHABLE_KEY);
    expect(recorded[0]?.headers.get("authorization")).toBe(
      `Bearer ${PUBLISHABLE_KEY}`,
    );
    expect(recorded[0]?.headers.get("x-biblequest-web-auth")).toBe("v2");
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBeNull();
  });

  it("revokes the captured bearer through the isolated real client", async () => {
    const result = await createAccountSignOutClient().auth.admin.signOut(
      ACCESS_TOKEN,
      "global",
    );

    expect(result.error).toBeNull();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      url: `${ORIGIN}/auth/v1/logout?scope=global`,
      method: "POST",
    });
    expect(recorded[0]?.headers.get("authorization")).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
    expect(recorded[0]?.headers.get("apikey")).toBe(PUBLISHABLE_KEY);
    expect(recorded[0]?.headers.get(WEB_AUTH_PROTOCOL_HEADER)).toBe(
      WEB_AUTH_PROTOCOL_VERSION,
    );
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBeNull();
  });

  it("refreshes a retained deletion session with the isolated real client", async () => {
    const retained = verifiedSessionResponse();
    localStorage.setItem(
      WEB_AUTH_V2_KEY,
      JSON.stringify({ version: 2, mode: "deleting", session: retained }),
    );

    const verification = await withWebAccountOperationLock((handle) =>
      refreshRetainedDeletingWebSession(handle, retained),
    );

    expect(verification).toBe("active");
    expect(
      recorded.some((entry) => entry.url === `${ORIGIN}/auth/v1/user`),
      "the real refresher must reach GoTrue",
    ).toBe(true);
    expect(
      recorded.some(
        (entry) =>
          entry.url ===
          `${ORIGIN}/rest/v1/rpc/own_account_deletion_status`,
      ),
      "the refreshed bearer must reach the deletion-status RPC",
    ).toBe(true);
    expect(
      recorded
        .filter(
          (entry) =>
            entry.url === `${ORIGIN}/auth/v1/user` ||
            entry.url ===
              `${ORIGIN}/rest/v1/rpc/own_account_deletion_status`,
        )
        .every(
          (entry) =>
            entry.headers.get("authorization") === `Bearer ${ACCESS_TOKEN}`,
        ),
    ).toBe(true);
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "deleting",
    });
  });

  it.each(["apple", "google"] as const)(
    "builds the %s PKCE request with the primary real client",
    async (provider) => {
      await withWebAccountOperationLock(requireCurrentWebAccountRealm);
      const result = await createClient().auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: "https://biblequest.test/auth/callback",
        },
      });

      expect(result.error).toBeNull();
      const authorizationUrl = result.data.url;
      expect(authorizationUrl).toBeTruthy();
      if (!authorizationUrl) throw new Error("OAuth fixture returned no URL.");
      const url = new URL(authorizationUrl);
      expect(url.origin).toBe(ORIGIN);
      expect(url.pathname).toBe("/auth/v1/authorize");
      expect(url.searchParams.get("provider")).toBe(provider);
      expect(url.searchParams.get("redirect_to")).toBe(
        "https://biblequest.test/auth/callback",
      );
      expect(url.searchParams.get("code_challenge")).toBeTruthy();
      expect(url.searchParams.get("code_challenge_method")).toBe("s256");
      expect(fetch).not.toHaveBeenCalled();
      expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBeNull();
      expect(
        storageKeys().some(
          (key) =>
            key.startsWith(WEB_AUTH_V2_KEY) && key.includes("code-verifier"),
        ),
      ).toBe(true);
    },
  );

  it("exchanges and stages an OAuth code through the real PKCE client", async () => {
    await withWebAccountOperationLock(async (handle) => {
      await requireCurrentWebAccountRealm(handle);
      const started = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: "https://biblequest.test/auth/callback" },
      });
      expect(started.error).toBeNull();
    });

    await withWebAccountOperationLock((handle) =>
      completeVerifiedWebOAuth("fixture-auth-code", handle),
    );

    const exchange = recorded.find(
      (entry) => entry.url === `${ORIGIN}/auth/v1/token?grant_type=pkce`,
    );
    expect(exchange, "the real client must exchange the code").toBeDefined();
    expect(exchange?.method).toBe("POST");
    expect(exchange?.body).toMatchObject({
      auth_code: "fixture-auth-code",
      code_verifier: expect.any(String),
    });
    expect(exchange?.headers.get("apikey")).toBe(PUBLISHABLE_KEY);
    expect(exchange?.headers.get(WEB_AUTH_PROTOCOL_HEADER)).toBe(
      WEB_AUTH_PROTOCOL_VERSION,
    );

    const identityRequest = recorded.find(
      (entry) => entry.url === `${ORIGIN}/auth/v1/user`,
    );
    const deletionRequest = recorded.find(
      (entry) =>
        entry.url ===
        `${ORIGIN}/rest/v1/rpc/own_account_deletion_status`,
    );
    expect(
      identityRequest,
      "the exchanged identity must be verified",
    ).toBeDefined();
    expect(deletionRequest, "the deletion latch must be checked").toBeDefined();
    expect(deletionRequest?.headers.get("authorization")).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
    expect(localStorage.getItem(`${WEB_AUTH_V2_KEY}-code-verifier`)).toBeNull();
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "installing",
    });
  });

  it.each([
    {
      name: "customer web",
      origin: "https://www.biblequest.co",
      headers: new Headers({
        [WEB_AUTH_PROTOCOL_HEADER]: WEB_AUTH_PROTOCOL_VERSION,
      }),
      expectedBoundary: WEB_AUTH_PROTOCOL_HEADER,
      expectedValue: WEB_AUTH_PROTOCOL_VERSION,
    },
    {
      name: "native iOS",
      origin: NATIVE_APP_ORIGIN,
      headers: new Headers({
        [NATIVE_ACCOUNT_BETA_HEADER]: NATIVE_ACCOUNT_BETA_HEADER_VALUE,
      }),
      expectedBoundary: NATIVE_ACCOUNT_BETA_HEADER,
      expectedValue: NATIVE_ACCOUNT_BETA_HEADER_VALUE,
    },
  ])(
    "verifies the $name bearer and keeps it on the returned real RLS client",
    async ({ origin, headers, expectedBoundary, expectedValue }) => {
      const requestHeaders = new Headers(headers);
      requestHeaders.set("authorization", `Bearer ${ACCESS_TOKEN}`);
      requestHeaders.set("origin", origin);
      requestHeaders.set(EXPECTED_ACCOUNT_USER_HEADER, USER_ID);
      const request = new Request(
        "https://www.biblequest.co/api/profile/avatar",
        {
          headers: requestHeaders,
        },
      );

      const result = await authenticatedServerContext(request);
      expect(result).not.toBeInstanceOf(Response);
      if (result instanceof Response) {
        throw new Error("Bearer fixture did not authenticate.");
      }

      const rpc = await result.supabase.rpc("auth_surface_fixture");
      expect(rpc.error).toBeNull();
      expect(rpc.data).toEqual({ ok: true });

      const identityRequest = recorded.find(
        (entry) => entry.url === `${ORIGIN}/auth/v1/user`,
      );
      const rpcRequest = recorded.find(
        (entry) =>
          entry.url === `${ORIGIN}/rest/v1/rpc/auth_surface_fixture`,
      );
      expect(identityRequest, "the real client must reach GoTrue").toBeDefined();
      expect(
        rpcRequest,
        "the returned client must reach PostgREST",
      ).toBeDefined();
      for (const entry of [identityRequest, rpcRequest]) {
        expect(entry?.headers.get("authorization")).toBe(
          `Bearer ${ACCESS_TOKEN}`,
        );
        expect(entry?.headers.get("apikey")).toBe(PUBLISHABLE_KEY);
        expect(entry?.headers.get(EXPECTED_ACCOUNT_USER_HEADER)).toBe(USER_ID);
        expect(entry?.headers.get(expectedBoundary)).toBe(expectedValue);
      }
    },
  );
});
