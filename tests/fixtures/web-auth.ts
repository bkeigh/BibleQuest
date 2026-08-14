import {
  WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
  WEB_PRIVATE_NAMESPACE_V2_MARKER,
  WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
} from "@/lib/storage/web-private-namespace";

/**
 * Shared fixtures for suites that consume the browser-owned auth boundary.
 *
 * These helpers establish REAL authority state — a stored envelope, the v2
 * namespace marker, service-worker attestation, and an adopted private write
 * generation — instead of stubbing the guards. Production refuses private
 * reads until all of that holds, so a fixture that skips a step asserts
 * against a refusal it created itself. Six tests regressed exactly that way
 * when this boundary landed; see commit 1a8b6ff before "simplifying" this.
 *
 * vi.mock topology stays in each test file (vitest hoists mocks per file, and
 * each suite deliberately mocks a different seam). This module carries only
 * data builders and authority establishment, and it imports the auth core
 * lazily so it always operates on the same module instance the calling test
 * gets after vi.resetModules().
 *
 * Suites still hand-rolling related setups (candidates for later porting):
 * email-otp-verification (full Session objects for the verification flow),
 * web-auth-storage (the core's own richer install() spec fixtures).
 */

/**
 * The production localStorage key of the auth envelope, pinned as a literal on
 * purpose: importing it from the impure auth core would evaluate 3.2k lines of
 * module side effects before the calling suite's own imports, and an
 * accidental production key change should fail these fixtures loudly.
 */
export const WEB_AUTH_ENVELOPE_KEY = "biblequest:web-auth:v2";

/** Mints the unsigned fixture JWT shape the envelope parser accepts. */
export function webAccessToken(
  userId: string,
  sessionId = "fixture-lineage",
): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, session_id: sessionId }),
  ).toString("base64url");
  return `fixture.${payload}.signature`;
}

export interface SeedWebAuthEnvelopeOptions {
  sessionId?: string;
  accessToken?: string;
  refreshToken?: string;
  mode?: "active" | "installing" | "signing-out" | "deleting";
}

/** Writes a stored v2 auth envelope; returns the access token it carries. */
export function seedWebAuthEnvelope(
  userId: string,
  options: SeedWebAuthEnvelopeOptions = {},
): string {
  const sessionId = options.sessionId ?? "fixture-lineage";
  const token = options.accessToken ?? webAccessToken(userId, sessionId);
  window.localStorage.setItem(
    WEB_AUTH_ENVELOPE_KEY,
    JSON.stringify({
      version: 2,
      mode: options.mode ?? "active",
      session: {
        access_token: token,
        refresh_token: options.refreshToken ?? `refresh-${sessionId}`,
        user: { id: userId },
      },
    }),
  );
  return token;
}

/** Marks the device's private namespace as cut over and owned by this user. */
export function seedV2Namespace(userId: string): void {
  window.localStorage.setItem(
    WEB_PRIVATE_NAMESPACE_V2_MARKER,
    WEB_PRIVATE_NAMESPACE_V2_COMPLETE,
  );
  window.localStorage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, userId);
}

/** Seeds the full signed-in device state: envelope plus owned v2 namespace. */
export function seedActiveWebAccount(
  userId: string,
  options: SeedWebAuthEnvelopeOptions = {},
): string {
  const token = seedWebAuthEnvelope(userId, options);
  seedV2Namespace(userId);
  return token;
}

/**
 * Attests this realm and adopts the private write generation for the seeded
 * owner — the standing authority every private read requires. Call after
 * seedActiveWebAccount() and after the calling suite's mocks are in place.
 * Throws instead of returning false so a broken fixture fails at the setup
 * line, not as a confusing refusal inside the assertion under test.
 */
export async function attestAndAdopt(userId: string): Promise<void> {
  const {
    adoptCurrentWebPrivateWriteGeneration,
    requireCurrentWebAccountRealm,
    withWebAccountOperationLock,
  } = await import("@/lib/supabase/web-auth-storage");
  await withWebAccountOperationLock(async (handle) => {
    await requireCurrentWebAccountRealm(handle);
    const adopted = await adoptCurrentWebPrivateWriteGeneration(handle, userId);
    if (!adopted) {
      throw new Error(
        "web-auth fixture could not adopt the private write generation; " +
          "check that the envelope, namespace marker, and owner key were " +
          "seeded for this user and that attestation is mocked to resolve",
      );
    }
  });
}
