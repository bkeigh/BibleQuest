import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

/**
 * These cases deliberately use the REAL @supabase/supabase-js client.
 *
 * The 2026-08-18 production defect could not exist under the mocked client the
 * rest of this suite uses: supabase-js replaces `client.auth` with a Proxy
 * whose get trap THROWS whenever the client is constructed with the
 * `accessToken` option, so merely reading `.getUser` raises — before any
 * request is built. A hand-rolled mock always has a callable `.auth.getUser`,
 * which is exactly why 1,482 green tests shipped a sign-in flow in which
 * every web credential verification returned "unavailable", every time, with
 * no network call. Only the library's own construction semantics can pin this.
 *
 * The network boundary is the only thing faked here, via global fetch.
 */

const mocks = vi.hoisted(() => ({
  requireAttestation: vi.fn(),
}));

vi.mock("@/lib/platform/web-auth-service-worker", () => ({
  requireWebAuthServiceWorkerAttestation: mocks.requireAttestation,
}));

vi.mock("@/lib/storage/web-private-cutover", () => ({
  commitWebPrivateHandoffOwner: vi.fn(),
  cutoverLegacyWebPrivateDataToV2: vi.fn(),
  establishNeverOwnedWebPrivateGuestProvenance: vi.fn(),
  purgeAndCommitFreshWebPrivateInstall: vi.fn(),
  removeAndProveLegacyWebPrivateResidue: vi.fn(),
  readLegacyWebPrivateCutoverState: () => "committed",
  readWebPrivateHandoffCommitState: vi.fn(),
  readWebPrivateSourceOwnerDisposition: vi.fn(),
}));

vi.mock("@/lib/questos/store", () => ({
  coordinateQuestOSWebPrivateHydration: vi.fn(),
  useQuestOS: { persist: { rehydrate: vi.fn() } },
}));

import { verifyRetainedWebAuthSession } from "@/lib/supabase/web-auth-storage";
import { EXPECTED_ACCOUNT_USER_HEADER } from "@/lib/sync/native-beta-headers";

const ORIGIN = "https://verifier-fixture.supabase.co";
const PUBLISHABLE_KEY = `sb_publishable_${"a".repeat(28)}`;
const USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "11111111-2222-4333-8444-555555555555";

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** A structurally valid access token; the signature is never checked locally. */
const ACCESS_TOKEN = [
  base64url({ alg: "HS256", typ: "JWT" }),
  base64url({
    sub: USER_ID,
    session_id: SESSION_ID,
    role: "authenticated",
    exp: 4_102_444_800,
  }),
  "fixture-signature",
].join(".");

const RETAINED_SESSION = {
  access_token: ACCESS_TOKEN,
  refresh_token: "fixture-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4_102_444_800,
  user: { id: USER_ID },
} as unknown as Session;

interface RecordedRequest {
  url: string;
  method: string;
  authorization: string | null;
  apikey: string | null;
  expectedUser: string | null;
}

const recorded: RecordedRequest[] = [];
let deletionPending = false;

function recordAndRespond(
  input: RequestInfo | URL,
  init?: RequestInit,
): Response {
  const url = String(input instanceof Request ? input.url : input);
  const headers = new Headers(
    input instanceof Request ? input.headers : init?.headers,
  );
  recorded.push({
    url,
    method: (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase(),
    authorization: headers.get("authorization"),
    apikey: headers.get("apikey"),
    expectedUser: headers.get(EXPECTED_ACCOUNT_USER_HEADER),
  });
  if (url.includes("/auth/v1/user")) {
    return new Response(
      JSON.stringify({ id: USER_ID, aud: "authenticated" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (url.includes("/rest/v1/rpc/own_account_deletion_status")) {
    return new Response(
      JSON.stringify({
        contract: "biblequest_account_deletion_status_v1",
        pending: deletionPending,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ message: "unexpected request" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  recorded.length = 0;
  deletionPending = false;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGIN);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      recordAndRespond(input, init),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verifyParsedSession against the real supabase-js client", () => {
  it("classifies a server-confirmed credential as active, not unavailable", async () => {
    // Against the unfixed code this returns "unavailable" without a single
    // network request: reading `.getUser` off the accessToken-configured
    // client throws, and the trailing catch converts the throw into the
    // verdict. That is the 2026-08-18 production failure.
    await expect(verifyRetainedWebAuthSession(RETAINED_SESSION)).resolves.toBe(
      "active",
    );

    const identityCall = recorded.find((r) => r.url.includes("/auth/v1/user"));
    expect(identityCall, "identity check must reach /auth/v1/user").toBeDefined();
    expect(identityCall?.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(identityCall?.apikey).toBe(PUBLISHABLE_KEY);
  });

  it("keeps the person's bearer on the deletion-status RPC", async () => {
    // Guards the tempting wrong fix: dropping the accessToken option to make
    // `.auth` usable again would silently demote this RPC to anonymous, and
    // RLS would answer for the wrong principal.
    await verifyRetainedWebAuthSession(RETAINED_SESSION);

    const rpcCall = recorded.find((r) =>
      r.url.includes("/rest/v1/rpc/own_account_deletion_status"),
    );
    expect(rpcCall, "deletion-status RPC must be reached").toBeDefined();
    expect(rpcCall?.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(rpcCall?.expectedUser).toBe(USER_ID);
  });

  it("reports a pending deletion as pending, proving the RPC verdict is read", async () => {
    deletionPending = true;
    await expect(verifyRetainedWebAuthSession(RETAINED_SESSION)).resolves.toBe(
      "pending",
    );
  });
});
