import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pins the two mechanisms behind the 2026-08-18 first-sign-in deadlock, using
 * the REAL @supabase/supabase-js client (only the network is faked):
 *
 * 1. The private-read gate conflation. accountAccessToken read the bearer via
 *    readActiveWebAuthSession, which requires webPrivateReadAllowed() — but on
 *    a first sign-in that gate cannot open until sync has run, and sync cannot
 *    run until the deletion-status RPC (which needs the bearer) succeeds. The
 *    credential is auth-plane state and must be readable behind attestation
 *    alone.
 *
 * 2. The self-echo. auth-js recomputes `expires_in` from the wall clock on
 *    every setSession, so the strict adapter's whole-session JSON comparison
 *    saw an identical credential as "changed", re-verified it over the
 *    network, re-wrote it, and broadcast a change — which re-ran the
 *    bootstrap, 2Hz, forever.
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

import {
  WEB_AUTH_V2_KEY,
  WEB_AUTH_V2_MIGRATION_KEY,
  createStrictWebAuthStorage,
  requireCurrentWebAccountRealm,
  withWebAccountOperationLock,
} from "@/lib/supabase/web-auth-storage";
import { ownAccountDeletionIsPending } from "@/lib/auth/account-deletion";

const ORIGIN = "https://verifier-fixture.supabase.co";
const PUBLISHABLE_KEY = `sb_publishable_${"a".repeat(28)}`;
const USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "11111111-2222-4333-8444-555555555555";

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function accessTokenFor(marker: string): string {
  return [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({
      sub: USER_ID,
      session_id: SESSION_ID,
      role: "authenticated",
      marker,
      exp: 4_102_444_800,
    }),
    "fixture-signature",
  ].join(".");
}

const ACCESS_TOKEN = accessTokenFor("initial");

function sessionJson(accessToken: string, refreshToken: string, expiresIn: number) {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: 4_102_444_800,
    user: { id: USER_ID },
  };
}

function seedActiveEnvelope() {
  localStorage.setItem(WEB_AUTH_V2_MIGRATION_KEY, "1");
  localStorage.setItem(
    WEB_AUTH_V2_KEY,
    JSON.stringify({
      version: 2,
      mode: "active",
      session: sessionJson(ACCESS_TOKEN, "fixture-refresh-token", 3600),
    }),
  );
}

interface RecordedRequest {
  url: string;
  authorization: string | null;
}

const recorded: RecordedRequest[] = [];
const broadcasts: { channel: string; data: unknown }[] = [];

class RecordingBroadcastChannel {
  constructor(private name: string) {}
  postMessage(data: unknown) {
    broadcasts.push({ channel: this.name, data });
  }
  close() {}
  set onmessage(_v: unknown) {}
  addEventListener() {}
  removeEventListener() {}
}

beforeEach(async () => {
  recorded.length = 0;
  broadcasts.length = 0;
  localStorage.clear();
  mocks.requireAttestation.mockResolvedValue(undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGIN);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  vi.stubGlobal("BroadcastChannel", RecordingBroadcastChannel);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers = new Headers(
        input instanceof Request ? input.headers : init?.headers,
      );
      recorded.push({ url, authorization: headers.get("authorization") });
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: USER_ID, aud: "authenticated" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/rest/v1/rpc/own_account_deletion_status")) {
        return new Response(
          JSON.stringify({
            contract: "biblequest_account_deletion_status_v1",
            pending: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  seedActiveEnvelope();
  await withWebAccountOperationLock(requireCurrentWebAccountRealm);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("first sign-in bootstrap: gate conflation and self-echo", () => {
  it("answers the deletion-status check before the private journey is adopted", async () => {
    // A first sign-in has an active envelope and an attested realm, but NO
    // adopted private-read authority and NO synced owner marker — sync has
    // never run. The bearer must still be readable for account RPCs, or the
    // bootstrap deadlocks: RPC needs gate, gate needs sync, sync needs RPC.
    await expect(ownAccountDeletionIsPending(USER_ID)).resolves.toBe(false);

    const rpc = recorded.find((r) =>
      r.url.includes("/rest/v1/rpc/own_account_deletion_status"),
    );
    expect(rpc, "the RPC must actually be issued").toBeDefined();
    expect(rpc?.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it("treats re-persisting an unchanged credential as a no-op, not news", async () => {
    const storage = createStrictWebAuthStorage();
    const envelopeBefore = localStorage.getItem(WEB_AUTH_V2_KEY);
    const networkBefore = recorded.length;
    const broadcastsBefore = broadcasts.length;

    // Same tokens, same identity — only the wall-clock-derived expires_in
    // differs, exactly what auth-js hands the adapter on every setSession.
    await storage.setItem(
      WEB_AUTH_V2_KEY,
      JSON.stringify(sessionJson(ACCESS_TOKEN, "fixture-refresh-token", 1234)),
    );

    expect(broadcasts.length, "no change broadcast for an unchanged credential")
      .toBe(broadcastsBefore);
    expect(recorded.length, "no network re-verification for an unchanged credential")
      .toBe(networkBefore);
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBe(envelopeBefore);
  });

  it("still verifies, persists, and announces a genuinely rotated credential", async () => {
    const storage = createStrictWebAuthStorage();
    const rotatedAccess = accessTokenFor("rotated");
    const broadcastsBefore = broadcasts.length;

    await storage.setItem(
      WEB_AUTH_V2_KEY,
      JSON.stringify(sessionJson(rotatedAccess, "rotated-refresh-token", 3600)),
    );

    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toContain("rotated-refresh-token");
    expect(
      recorded.some((r) => r.url.includes("/auth/v1/user")),
      "a rotated credential is re-verified over the network",
    ).toBe(true);
    expect(
      broadcasts.filter((b) => b.channel === "biblequest:web-auth-change:v2").length,
      "a real change is announced exactly once",
    ).toBe(broadcastsBefore + 1);
  });
});
