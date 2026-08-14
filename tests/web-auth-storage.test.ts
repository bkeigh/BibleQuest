import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COOKIE_OPTIONS,
  createChunks,
  isChunkLike,
  serialize,
  stringToBase64URL,
} from "@supabase/ssr";
import type { Session } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  commitOwner: vi.fn(),
  coordinateHydration: vi.fn(),
  cutover: vi.fn(),
  createSupabaseClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  rehydrate: vi.fn(),
  handoffState: vi.fn(),
  purgeFreshInstall: vi.fn(),
  removeLegacyResidue: vi.fn(),
  rpc: vi.fn(),
  setSession: vi.fn(),
  sourceDisposition: vi.fn(),
  requireAttestation: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createSupabaseClient,
}));

vi.mock("@/lib/platform/web-auth-service-worker", () => ({
  requireWebAuthServiceWorkerAttestation: mocks.requireAttestation,
}));

vi.mock("@/lib/storage/web-private-cutover", () => ({
  commitWebPrivateHandoffOwner: mocks.commitOwner,
  cutoverLegacyWebPrivateDataToV2: mocks.cutover,
  establishNeverOwnedWebPrivateGuestProvenance: vi.fn(),
  purgeAndCommitFreshWebPrivateInstall: mocks.purgeFreshInstall,
  removeAndProveLegacyWebPrivateResidue: mocks.removeLegacyResidue,
  readLegacyWebPrivateCutoverState: () => "committed",
  readWebPrivateHandoffCommitState: mocks.handoffState,
  readWebPrivateSourceOwnerDisposition: mocks.sourceDisposition,
}));

vi.mock("@/lib/questos/store", () => ({
  coordinateQuestOSWebPrivateHydration: mocks.coordinateHydration,
  useQuestOS: { persist: { rehydrate: mocks.rehydrate } },
}));

import {
  WEB_AUTH_V2_KEY,
  WEB_AUTH_V2_MIGRATION_KEY,
  WEB_PRIVATE_WRITE_GENERATION_KEY,
  WebAuthUnavailableError,
  adoptCurrentWebPrivateWriteGeneration,
  beginReviewedWebPrivateRemoval,
  beginWebPrivateWrite,
  clearExactWebAuthSession,
  clearExpectedWebAuthSubject,
  clearRevokedWebAuthSubject,
  confirmTerminalWebPrivateDataPurge,
  constructWithoutAuthBroadcast,
  createStrictWebAuthStorage,
  installVerifiedWebSession,
  markWebAccountDeleting,
  markWebAccountSigningOut,
  migrateLegacyWebSession,
  readActiveWebAuthSession,
  readWebAuthState,
  registerWebPrivateMemoryReset,
  reviewedWebPrivateWriteRemovalAllowed,
  refreshRetainedDeletingWebSession,
  requireCurrentWebAccountRealm,
  resumeInstallingWebSession,
  subscribeWebAuthStorageChanges,
  webPrivateActiveResetCommitAllowed,
  webPrivateLegacyGuestRecoveryAllowed,
  webPrivateReadAllowed,
  webPrivateRemovalGuardIsCurrent,
  webPrivateWriteGuardIsCurrent,
  withActiveWebPrivateWriteReset,
  withLegacyWebPrivateGuestRecovery,
  withLockedLocalJourneyPrivateReset,
  withTerminalWebPrivateWriteCleanup,
  withWebPrivateLegacyAbsenceAudit,
  withWebAccountOperationLock,
  withWebAuthStorageLock,
} from "@/lib/supabase/web-auth-storage";
import { LAST_SYNC_USER_STORAGE_KEY } from "@/lib/sync/last-user";
import {
  LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
  WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS,
  WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
  WEB_PRIVATE_NAMESPACE_V2_MARKER,
  WEB_PRIVATE_NEVER_OWNED_VALUE,
  WEB_V2_GUEST_PROVENANCE_STORAGE_KEY,
  WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
  WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
} from "@/lib/storage/web-private-namespace";

const ORIGIN = "https://fixture.supabase.co";
const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const STATUS_CONTRACT = "biblequest_account_deletion_status_v1";

/** Encodes the two claims that form the v2 subject and session lineage. */
function accessToken(userId: string, sessionId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, session_id: sessionId }),
  ).toString("base64url");
  return `fixture.${payload}.signature`;
}

/** Builds one bounded full session accepted by the strict v2 parser. */
function session(
  userId: string,
  sessionId: string,
  suffix = "one",
): Session {
  return {
    access_token: accessToken(userId, sessionId),
    refresh_token: `refresh-${userId}-${suffix}`,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: userId,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-08-14T00:00:00.000Z",
    },
  } as Session;
}

/** Returns the exact credential embedded in one fixture session. */
function credential(value: Session) {
  return {
    userId: value.user.id,
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
  };
}

/** Decodes only the fixture subject for the storage-free verifier mock. */
function tokenSubject(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString()).sub ?? null;
  } catch {
    return null;
  }
}

/** Seeds a durable envelope to model a prior browser load. */
function seed(
  mode: "installing" | "active" | "deleting" | "signing-out",
  value: Session,
) {
  localStorage.setItem(
    WEB_AUTH_V2_KEY,
    JSON.stringify({ version: 2, mode, session: value }),
  );
}

/** Runs one direct install with the required account-operation ownership. */
function install(value: Session) {
  return withWebAccountOperationLock((handle) =>
    installVerifiedWebSession(handle, value, "email-otp"),
  );
}

/** Attests a seeded fixture before an active bearer or SDK adapter may use it. */
function attest() {
  return withWebAccountOperationLock(requireCurrentWebAccountRealm);
}

/** Creates the opaque rollback-absence proof required before sign-out clear. */
async function prepareMarkedSignOut(
  handle: Parameters<typeof requireCurrentWebAccountRealm>[0],
  userId: string,
): Promise<boolean> {
  await requireCurrentWebAccountRealm(handle);
  return withWebPrivateLegacyAbsenceAudit(handle, userId, () =>
    mocks.removeLegacyResidue(handle, userId),
  );
}

/** Clears one marked subject inside the exact live account operation. */
function clearMarkedSignOut(userId: string, beforeClear?: () => void) {
  return withWebAccountOperationLock(async (handle) => {
    if (!(await prepareMarkedSignOut(handle, userId))) return "unavailable";
    beforeClear?.();
    return clearRevokedWebAuthSubject(handle, userId);
  });
}

/** Models cookie chunk replacement and scoped expiry for v1 migration. */
class CookieJar {
  readonly values = new Map<string, string>();

  get cookie(): string {
    return [...this.values]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  set cookie(serialized: string) {
    const [pair, ...attributes] = serialized.split(";").map((part) =>
      part.trim(),
    );
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (attributes.some((part) => /^max-age=0$/i.test(part))) {
      this.values.delete(name);
    } else {
      this.values.set(name, value);
    }
  }

  /** Installs one complete legacy auth cookie in deliberately small chunks. */
  install(value: Session): void {
    const key = "sb-fixture-auth-token";
    for (const name of [...this.values.keys()]) {
      if (isChunkLike(name, key)) this.values.delete(name);
    }
    const encoded = `base64-${stringToBase64URL(JSON.stringify(value))}`;
    for (const chunk of createChunks(key, encoded, 64)) {
      this.cookie = serialize(chunk.name, chunk.value, DEFAULT_COOKIE_OPTIONS);
    }
  }
}

/** Models a browser that accepts cookie writes but fails their expiry readback. */
class StubbornCookieJar extends CookieJar {
  override get cookie(): string {
    return super.cookie;
  }

  override set cookie(serialized: string) {
    if (/Max-Age=0/i.test(serialized)) return;
    super.cookie = serialized;
  }
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ORIGIN);
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_fixture_1234567890abcdef",
  );
  mocks.createSupabaseClient.mockReset();
  mocks.commitOwner.mockReset().mockImplementation(
    async (_handle: unknown, userId: string, keep: boolean) => {
      localStorage.setItem("biblequest:web-private:v2:last-sync-user", userId);
      localStorage.setItem(
        "biblequest:web-private:v2:initial-sync-pending-user",
        userId,
      );
      if (keep) {
        localStorage.setItem(
          "biblequest:web-private:v2:local-claim-pending-user",
          userId,
        );
      }
      return true;
    },
  );
  mocks.coordinateHydration.mockReset().mockResolvedValue(true);
  mocks.cutover.mockReset().mockImplementation(async (userId: string) => {
    localStorage.setItem("biblequest:web-private:namespace:v2", "complete");
    localStorage.setItem("biblequest:web-private:v2:last-sync-user", userId);
    return "committed";
  });
  mocks.exchangeCodeForSession.mockReset();
  mocks.getUser.mockReset();
  mocks.handoffState.mockReset().mockResolvedValue("keep");
  mocks.purgeFreshInstall.mockReset().mockResolvedValue(true);
  mocks.removeLegacyResidue.mockReset().mockResolvedValue(true);
  mocks.rehydrate.mockReset().mockResolvedValue(undefined);
  mocks.rpc.mockReset();
  mocks.setSession.mockReset();
  mocks.sourceDisposition.mockReset().mockResolvedValue("exact-owner");
  mocks.requireAttestation.mockReset();
  mocks.requireAttestation.mockResolvedValue(undefined);
  mocks.getUser.mockImplementation(async (token: string) => ({
    data: { user: tokenSubject(token) ? { id: tokenSubject(token) } : null },
    error: null,
  }));
  mocks.rpc.mockResolvedValue({
    data: { contract: STATUS_CONTRACT, pending: false },
    error: null,
  });
  mocks.createSupabaseClient.mockImplementation(
    (
      _origin: string,
      _key: string,
      options: {
        auth?: { persistSession?: boolean; storageKey?: string };
      },
    ) => {
      const storageKey = options.auth?.storageKey;
      if (storageKey?.startsWith("biblequest-web-delete-resume-")) {
        return { auth: { setSession: mocks.setSession } };
      }
      if (options.auth?.persistSession === true) {
        return {
          auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
        };
      }
      return { auth: { getUser: mocks.getUser }, rpc: mocks.rpc };
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("strict v2 primary storage", () => {
  it("direct-installs only a verified empty slot and preserves an occupant", async () => {
    const a = session(USER_A, "lineage-a");
    const b = session(USER_B, "lineage-b");

    await expect(install(a)).resolves.toBe("installed");
    await expect(install(b)).resolves.toBe("occupied");
    await expect(readActiveWebAuthSession()).resolves.toEqual(credential(a));
    expect(localStorage.getItem(WEB_AUTH_V2_MIGRATION_KEY)).toBe("1");
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "own_account_deletion_status",
      "own_account_deletion_status",
    ]);
    expect(mocks.createSupabaseClient.mock.calls[0]?.[2]).toMatchObject({
      global: {
        headers: {
          "x-biblequest-expected-user": USER_A,
          "x-biblequest-web-auth": "v2",
        },
      },
    });
  });

  it("keeps irreversible provider adoption dormant during v2 install", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "adopt_web_account_protocol_v2"
        ? { data: null, error: { code: "fixture" } }
        : {
            data: { contract: STATUS_CONTRACT, pending: false },
            error: null,
          },
    );

    await expect(install(session(USER_A, "lineage-a"))).resolves.toBe(
      "installed",
    );
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "own_account_deletion_status",
      "own_account_deletion_status",
    ]);
  });

  it("does not consume or persist a candidate when realm attestation fails", async () => {
    mocks.requireAttestation.mockRejectedValueOnce(new Error("fixture"));

    await expect(install(session(USER_A, "lineage-a"))).resolves.toBe(
      "unavailable",
    );
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBeNull();
  });

  it("keeps an unowned install provisional until the user authorizes its journey", async () => {
    const a = session(USER_A, "lineage-a");
    mocks.sourceDisposition.mockResolvedValue("unowned");

    await expect(install(a)).resolves.toBe("recovery-required");
    await expect(readActiveWebAuthSession()).rejects.toBeInstanceOf(
      WebAuthUnavailableError,
    );
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "installing",
    });
    expect(mocks.cutover).not.toHaveBeenCalled();
    expect(mocks.rehydrate).not.toHaveBeenCalled();
  });

  it("rehydrates selected v2 data before an explicit provisional install activates", async () => {
    const a = session(USER_A, "lineage-a");
    mocks.sourceDisposition
      .mockResolvedValueOnce("unowned")
      .mockResolvedValueOnce("unowned")
      .mockResolvedValueOnce("exact-owner");
    await expect(install(a)).resolves.toBe("recovery-required");
    mocks.rehydrate.mockImplementationOnce(async () => {
      expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toContain(
        '"mode":"installing"',
      );
    });

    await expect(
      withWebAccountOperationLock((handle) =>
        resumeInstallingWebSession(handle, "explicit-keep-local-journey"),
      ),
    ).resolves.toBe("activated");
    await expect(readActiveWebAuthSession()).resolves.toEqual(credential(a));
    expect(mocks.commitOwner).toHaveBeenCalledWith(
      expect.any(Object),
      USER_A,
      true,
    );
    expect(mocks.coordinateHydration).toHaveBeenCalledWith({
      kind: "installing",
      handle: expect.any(Object),
      userId: USER_A,
    });
  });

  it("durably resumes a fresh install without rewriting it as keep", async () => {
    const a = session(USER_A, "lineage-a");
    mocks.sourceDisposition.mockResolvedValue("unowned");
    await expect(install(a)).resolves.toBe("recovery-required");
    mocks.purgeFreshInstall.mockResolvedValueOnce(false);

    await expect(
      withWebAccountOperationLock((handle) =>
        resumeInstallingWebSession(handle, "explicit-start-fresh"),
      ),
    ).resolves.toBe("unavailable");
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "installing",
      installIntent: "fresh",
    });

    mocks.sourceDisposition.mockResolvedValue("exact-owner");
    mocks.handoffState.mockResolvedValue("fresh");
    mocks.purgeFreshInstall.mockImplementationOnce(async (_handle, userId) => {
      localStorage.setItem(WEB_PRIVATE_NAMESPACE_V2_MARKER, "complete");
      localStorage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, userId);
      localStorage.setItem(WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY, userId);
      localStorage.removeItem("biblequest:web-private:v2:local-claim-pending-user");
      localStorage.removeItem(WEB_V2_GUEST_PROVENANCE_STORAGE_KEY);
      return true;
    });
    await expect(
      withWebAccountOperationLock((handle) =>
        resumeInstallingWebSession(handle),
      ),
    ).resolves.toBe("activated");
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "active",
    });
    expect((await readWebAuthState())).not.toHaveProperty("installIntent");
    expect(mocks.commitOwner).not.toHaveBeenCalled();
  });

  it("durably resumes a keep install without rewriting it as fresh", async () => {
    const a = session(USER_A, "lineage-a");
    mocks.sourceDisposition.mockResolvedValue("unowned");
    await expect(install(a)).resolves.toBe("recovery-required");
    mocks.cutover.mockResolvedValueOnce("unavailable");

    await expect(
      withWebAccountOperationLock((handle) =>
        resumeInstallingWebSession(handle, "explicit-keep-local-journey"),
      ),
    ).resolves.toBe("unavailable");
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "installing",
      installIntent: "keep",
    });

    mocks.sourceDisposition.mockResolvedValue("exact-owner");
    await expect(
      withWebAccountOperationLock((handle) =>
        resumeInstallingWebSession(handle),
      ),
    ).resolves.toBe("activated");
    expect(mocks.purgeFreshInstall).not.toHaveBeenCalled();
    expect(mocks.commitOwner).toHaveBeenCalledWith(
      expect.any(Object),
      USER_A,
      true,
    );
    expect((await readWebAuthState())).not.toHaveProperty("installIntent");
  });

  it("hydrates one exact adopted authority only once across repeated hooks", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");
    const hydrationCalls = mocks.coordinateHydration.mock.calls.length;

    await withWebAccountOperationLock(async (handle) => {
      await expect(
        adoptCurrentWebPrivateWriteGeneration(handle, USER_A),
      ).resolves.toBe(true);
      await expect(
        adoptCurrentWebPrivateWriteGeneration(handle, USER_A),
      ).resolves.toBe(true);
    });
    expect(mocks.coordinateHydration).toHaveBeenCalledTimes(hydrationCalls);
  });

  it("closes ordinary reads and writes on namespace or owner drift", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");
    const guard = beginWebPrivateWrite();
    expect(guard).not.toBeNull();

    localStorage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, USER_B);
    expect(webPrivateReadAllowed()).toBe(false);
    expect(beginWebPrivateWrite()).toBeNull();
    expect(guard && webPrivateWriteGuardIsCurrent(guard)).toBe(false);

    localStorage.setItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, USER_A);
    localStorage.setItem(
      WEB_V2_GUEST_PROVENANCE_STORAGE_KEY,
      WEB_PRIVATE_NEVER_OWNED_VALUE,
    );
    expect(webPrivateReadAllowed()).toBe(false);
    localStorage.removeItem(WEB_V2_GUEST_PROVENANCE_STORAGE_KEY);
    localStorage.removeItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
    expect(webPrivateReadAllowed()).toBe(false);
  });

  it("resumes a durable guest clear but refuses keep during that phase", async () => {
    localStorage.setItem(
      WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY,
      WEB_PRIVATE_GUEST_CLEAR_IN_PROGRESS,
    );

    await withWebAccountOperationLock(async (handle) => {
      await expect(
        withLegacyWebPrivateGuestRecovery(
          handle,
          "explicit-keep",
          async () => true,
        ),
      ).rejects.toBeInstanceOf(WebAuthUnavailableError);
      await expect(
        withLegacyWebPrivateGuestRecovery(
          handle,
          "explicit-clear",
          async () => {
            expect(
              webPrivateLegacyGuestRecoveryAllowed("explicit-clear"),
            ).toBe(true);
            localStorage.removeItem(WEB_PRIVATE_GUEST_CLEAR_JOURNAL_KEY);
            localStorage.setItem(
              LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
              WEB_PRIVATE_NEVER_OWNED_VALUE,
            );
            return true;
          },
        ),
      ).resolves.toBe(true);
    });
    expect(beginWebPrivateWrite()).not.toBeNull();
    expect(mocks.coordinateHydration).toHaveBeenCalledWith();
  });

  it("allows only a verified same-subject same-lineage SDK refresh", async () => {
    const original = session(USER_A, "lineage-a", "old");
    const refreshed = session(USER_A, "lineage-a", "new");
    seed("active", original);
    await attest();
    const storage = createStrictWebAuthStorage();

    await storage.setItem(WEB_AUTH_V2_KEY, JSON.stringify(refreshed));

    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "active",
      credential: credential(refreshed),
    });
  });

  it.each([
    ["different subject", session(USER_B, "lineage-b")],
    ["different same-subject lineage", session(USER_A, "lineage-new")],
  ])("rejects a %s SDK install without changing exact bytes", async (_name, candidate) => {
    const original = session(USER_A, "lineage-a");
    seed("active", original);
    const before = localStorage.getItem(WEB_AUTH_V2_KEY);
    const storage = createStrictWebAuthStorage();

    await expect(
      storage.setItem(WEB_AUTH_V2_KEY, JSON.stringify(candidate)),
    ).rejects.toBeInstanceOf(WebAuthUnavailableError);
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBe(before);
  });

  it("rejects refresh while deletion is pending and preserves exact bytes", async () => {
    const original = session(USER_A, "lineage-a", "old");
    const refreshed = session(USER_A, "lineage-a", "new");
    seed("active", original);
    const before = localStorage.getItem(WEB_AUTH_V2_KEY);
    mocks.rpc.mockResolvedValue({
      data: { contract: STATUS_CONTRACT, pending: true },
      error: null,
    });

    await expect(
      createStrictWebAuthStorage().setItem(
        WEB_AUTH_V2_KEY,
        JSON.stringify(refreshed),
      ),
    ).rejects.toBeInstanceOf(WebAuthUnavailableError);
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBe(before);
  });

  it("denies generic primary removal and hides every terminal envelope", async () => {
    const a = session(USER_A, "lineage-a");
    const storage = createStrictWebAuthStorage();
    seed("deleting", a);

    await expect(storage.getItem(WEB_AUTH_V2_KEY)).resolves.toBeNull();
    await expect(storage.removeItem(WEB_AUTH_V2_KEY)).rejects.toBeInstanceOf(
      WebAuthUnavailableError,
    );
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).not.toBeNull();
  });

  it("fails closed on malformed primary bytes without deleting them", async () => {
    localStorage.setItem(WEB_AUTH_V2_KEY, "not-an-envelope");

    await expect(readActiveWebAuthSession()).rejects.toBeInstanceOf(
      WebAuthUnavailableError,
    );
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBe("not-an-envelope");
  });

  it("retains a provisional envelope when completion marking fails", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === WEB_AUTH_V2_MIGRATION_KEY) throw new Error("fixture");
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
    };
    vi.stubGlobal("localStorage", storage);

    await expect(install(session(USER_A, "lineage-a"))).resolves.toBe(
      "recovery-required",
    );
    expect(values.get(WEB_AUTH_V2_KEY)).toContain('"mode":"installing"');
    expect(values.has(WEB_AUTH_V2_MIGRATION_KEY)).toBe(false);
  });

  it("completion-marks before exact removal and retains auth if marking fails", async () => {
    const a = session(USER_A, "lineage-a");
    const values = new Map<string, string>();
    values.set(
      WEB_AUTH_V2_KEY,
      JSON.stringify({ version: 2, mode: "active", session: a }),
    );
    values.set(WEB_PRIVATE_NAMESPACE_V2_MARKER, "complete");
    values.set(WEB_V2_LAST_SYNC_USER_STORAGE_KEY, USER_A);
    values.set(
      WEB_PRIVATE_WRITE_GENERATION_KEY,
      "10000000000000000000000000000000",
    );
    const operations: string[] = [];
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        operations.push(`set:${key}`);
        values.set(key, value);
      },
      removeItem: (key: string) => {
        operations.push(`remove:${key}`);
        values.delete(key);
      },
    };
    vi.stubGlobal("localStorage", storage);

    await expect(
      withWebAccountOperationLock((handle) =>
        clearExactWebAuthSession(handle, credential(a)),
      ),
    ).resolves.toBe("cleared");
    expect(operations.indexOf(`set:${WEB_AUTH_V2_MIGRATION_KEY}`)).toBeLessThan(
      operations.indexOf(`remove:${WEB_AUTH_V2_KEY}`),
    );

    values.set(
      WEB_AUTH_V2_KEY,
      JSON.stringify({ version: 2, mode: "active", session: a }),
    );
    values.delete(WEB_AUTH_V2_MIGRATION_KEY);
    storage.setItem = (key: string, value: string) => {
      if (key === WEB_AUTH_V2_MIGRATION_KEY) throw new Error("fixture");
      values.set(key, value);
    };
    await expect(
      withWebAccountOperationLock((handle) =>
        clearExactWebAuthSession(handle, credential(a)),
      ),
    ).resolves.toBe("unavailable");
    expect(values.get(WEB_AUTH_V2_KEY)).not.toBeNull();
  });
});

describe("terminal operations", () => {
  it("leaves active auth and memory untouched when terminal attestation fails", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");
    const envelope = localStorage.getItem(WEB_AUTH_V2_KEY);
    const generation = localStorage.getItem(WEB_PRIVATE_WRITE_GENERATION_KEY);
    const resetMemory = vi.fn();
    const unregister = registerWebPrivateMemoryReset(resetMemory);
    mocks.requireAttestation.mockRejectedValueOnce(new Error("fixture"));

    try {
      await withWebAccountOperationLock(async (handle) => {
        await expect(
          markWebAccountDeleting(handle, credential(a)),
        ).resolves.toBe("unavailable");
      });
    } finally {
      unregister();
    }
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBe(envelope);
    expect(localStorage.getItem(WEB_PRIVATE_WRITE_GENERATION_KEY)).toBe(
      generation,
    );
    expect(resetMemory).not.toHaveBeenCalled();
  });

  it("rotates before a terminal mark and grants only reviewed removal", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");
    const oldGuard = beginWebPrivateWrite();
    expect(oldGuard).not.toBeNull();

    await withWebAccountOperationLock(async (handle) => {
      await expect(markWebAccountDeleting(handle, credential(a))).resolves.toBe(
        "marked",
      );
      expect(oldGuard && webPrivateWriteGuardIsCurrent(oldGuard)).toBe(false);
      expect(beginWebPrivateWrite()).toBeNull();
      await withTerminalWebPrivateWriteCleanup(handle, USER_A, async () => {
        expect(reviewedWebPrivateWriteRemovalAllowed()).toBe(true);
      });
      expect(reviewedWebPrivateWriteRemovalAllowed()).toBe(false);
    });
  });

  it("never lets a queued removal inherit a later cleanup context", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");

    await withWebAccountOperationLock(async (handle) => {
      await expect(markWebAccountDeleting(handle, credential(a))).resolves.toBe(
        "marked",
      );
      let stale = null as ReturnType<typeof beginReviewedWebPrivateRemoval>;
      await withTerminalWebPrivateWriteCleanup(handle, USER_A, async () => {
        stale = beginReviewedWebPrivateRemoval();
        expect(stale).not.toBeNull();
        expect(stale && webPrivateRemovalGuardIsCurrent(stale)).toBe(true);
      });
      await withTerminalWebPrivateWriteCleanup(handle, USER_A, async () => {
        const current = beginReviewedWebPrivateRemoval();
        expect(current).not.toBeNull();
        expect(stale && webPrivateRemovalGuardIsCurrent(stale)).toBe(false);
        expect(current && webPrivateRemovalGuardIsCurrent(current)).toBe(true);
      });
    });
  });

  it("reopens only the initiating active reset after its purge succeeds", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");
    const oldGuard = beginWebPrivateWrite();
    expect(oldGuard).not.toBeNull();

    await withWebAccountOperationLock(async (handle) => {
      await expect(
        withActiveWebPrivateWriteReset(handle, USER_A, async () => {
          expect(oldGuard && webPrivateWriteGuardIsCurrent(oldGuard)).toBe(
            false,
          );
          expect(beginWebPrivateWrite()).toBeNull();
          expect(reviewedWebPrivateWriteRemovalAllowed()).toBe(true);
          expect(webPrivateActiveResetCommitAllowed(handle, USER_A)).toBe(true);
          expect(webPrivateActiveResetCommitAllowed(handle, USER_B)).toBe(false);
          return true;
        }),
      ).resolves.toBe(true);
      expect(reviewedWebPrivateWriteRemovalAllowed()).toBe(false);
      expect(webPrivateActiveResetCommitAllowed(handle, USER_A)).toBe(false);
      expect(beginWebPrivateWrite()).not.toBeNull();
    });
  });

  it("leaves active private writes closed after an incomplete reset", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");

    await withWebAccountOperationLock(async (handle) => {
      await expect(
        withActiveWebPrivateWriteReset(handle, USER_A, async () => false),
      ).resolves.toBe(false);
      expect(beginWebPrivateWrite()).toBeNull();
      await expect(
        adoptCurrentWebPrivateWriteGeneration(handle, USER_A),
      ).resolves.toBe(false);
    });
  });

  it("reopens a signed-out owned journey only after reviewed purge and owner clear", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");
    localStorage.setItem(LAST_SYNC_USER_STORAGE_KEY, USER_A);
    await withWebAccountOperationLock(async (handle) => {
      await markWebAccountSigningOut(handle, credential(a));
    });
    await clearMarkedSignOut(USER_A);
    localStorage.setItem("fixture-private", "present");

    await withWebAccountOperationLock(async (handle) => {
      await expect(
        withLockedLocalJourneyPrivateReset(handle, USER_A, async () => {
          expect(reviewedWebPrivateWriteRemovalAllowed()).toBe(true);
          localStorage.removeItem("fixture-private");
          localStorage.removeItem(WEB_PRIVATE_NAMESPACE_V2_MARKER);
          return localStorage.getItem("fixture-private") === null;
        }),
      ).resolves.toBe(true);
    });

    expect(localStorage.getItem(LAST_SYNC_USER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(WEB_V2_LAST_SYNC_USER_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_GUEST_PROVENANCE_STORAGE_KEY)).toBe(
      WEB_PRIVATE_NEVER_OWNED_VALUE,
    );
    expect(reviewedWebPrivateWriteRemovalAllowed()).toBe(false);
    expect(beginWebPrivateWrite()).not.toBeNull();
    expect(mocks.coordinateHydration).toHaveBeenCalledWith();
  });

  it("keeps a signed-out owner locked after an incomplete reviewed purge", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");
    localStorage.setItem(LAST_SYNC_USER_STORAGE_KEY, USER_A);
    await withWebAccountOperationLock((handle) =>
      markWebAccountSigningOut(handle, credential(a)).then(() => undefined),
    );
    await clearMarkedSignOut(USER_A);

    await withWebAccountOperationLock(async (handle) => {
      await expect(
        withLockedLocalJourneyPrivateReset(handle, USER_A, async () => false),
      ).resolves.toBe(false);
    });

    expect(localStorage.getItem(LAST_SYNC_USER_STORAGE_KEY)).toBe(USER_A);
    expect(beginWebPrivateWrite()).toBeNull();
  });

  it("retains the full session while deleting and clears only that subject", async () => {
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");

    await withWebAccountOperationLock(async (handle) => {
      await expect(markWebAccountDeleting(handle, credential(a))).resolves.toBe(
        "marked",
      );
      await expect(readWebAuthState(handle)).resolves.toMatchObject({
        status: "stored",
        mode: "deleting",
        session: a,
      });
      await expect(clearExpectedWebAuthSubject(USER_A)).resolves.toBe(
        "unavailable",
      );
      await withTerminalWebPrivateWriteCleanup(handle, USER_A, async () => {
        await expect(
          confirmTerminalWebPrivateDataPurge(
            handle,
            USER_A,
            async () => true,
          ),
        ).resolves.toBe(true);
        await expect(clearExpectedWebAuthSubject(USER_A)).resolves.toBe(
          "cleared",
        );
      });
    });
    await expect(readWebAuthState()).resolves.toEqual({ status: "missing" });
  });

  it("clears a marked newer A session by subject but never replacement B", async () => {
    const a = session(USER_A, "lineage-a");
    const b = session(USER_B, "lineage-b");
    await expect(install(a)).resolves.toBe("installed");
    await withWebAccountOperationLock((handle) =>
      markWebAccountSigningOut(handle, credential(a)).then(() => undefined),
    );

    await expect(clearMarkedSignOut(USER_A)).resolves.toBe("cleared");
    await expect(install(a)).resolves.toBe("installed");
    await withWebAccountOperationLock((handle) =>
      markWebAccountSigningOut(handle, credential(a)).then(() => undefined),
    );
    await expect(
      clearMarkedSignOut(USER_A, () => seed("active", b)),
    ).resolves.toBe(
      "different-user",
    );
    await attest();
    await expect(readActiveWebAuthSession()).rejects.toBeInstanceOf(
      WebAuthUnavailableError,
    );
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      credential: credential(b),
    });
  });

  it("never lets a late same-lineage refresh reinstall after a terminal mark", async () => {
    const a = session(USER_A, "lineage-a", "old");
    const late = session(USER_A, "lineage-a", "late");
    await expect(install(a)).resolves.toBe("installed");
    await withWebAccountOperationLock((handle) =>
      markWebAccountSigningOut(handle, credential(a)).then(() => undefined),
    );

    await expect(
      createStrictWebAuthStorage().setItem(
        WEB_AUTH_V2_KEY,
        JSON.stringify(late),
      ),
    ).rejects.toBeInstanceOf(WebAuthUnavailableError);
    await expect(clearMarkedSignOut(USER_A)).resolves.toBe("cleared");
    await expect(readWebAuthState()).resolves.toEqual({ status: "missing" });
  });

  it("keeps a replacement unreadable until exact owner adoption", async () => {
    const a = session(USER_A, "lineage-a");
    const b = session(USER_B, "lineage-b");
    seed("active", a);
    await withWebAccountOperationLock((handle) =>
      markWebAccountSigningOut(handle, credential(a)).then(() => undefined),
    );
    seed("active", b);

    await expect(readActiveWebAuthSession()).rejects.toBeInstanceOf(
      WebAuthUnavailableError,
    );
    await attest();
    await expect(readActiveWebAuthSession()).rejects.toBeInstanceOf(
      WebAuthUnavailableError,
    );
  });

  it("refreshes deletion recovery only within the retained lineage", async () => {
    const old = session(USER_A, "lineage-a", "old");
    const refreshed = session(USER_A, "lineage-a", "new");
    seed("deleting", old);
    mocks.setSession.mockResolvedValue({
      data: { session: refreshed },
      error: null,
    });

    await expect(
      withWebAccountOperationLock((handle) =>
        refreshRetainedDeletingWebSession(handle, old),
      ),
    ).resolves.toBe("active");
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "deleting",
      session: refreshed,
    });
  });

  it("rejects a deletion refresh with a different session lineage", async () => {
    const old = session(USER_A, "lineage-a", "old");
    const replacement = session(USER_A, "lineage-new", "new");
    seed("deleting", old);
    const before = localStorage.getItem(WEB_AUTH_V2_KEY);
    mocks.setSession.mockResolvedValue({
      data: { session: replacement },
      error: null,
    });

    await expect(
      withWebAccountOperationLock((handle) =>
        refreshRetainedDeletingWebSession(handle, old),
      ),
    ).resolves.toBe("invalid");
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBe(before);
  });
});

describe("legacy migration", () => {
  it("verifies one legacy session, completion-marks, and scrubs its chunks", async () => {
    const jar = new CookieJar();
    const a = session(USER_A, "lineage-a");
    jar.install(a);
    vi.stubGlobal("document", jar);

    await expect(
      withWebAccountOperationLock(migrateLegacyWebSession),
    ).resolves.toBe("installed");
    await expect(readActiveWebAuthSession()).resolves.toEqual(credential(a));
    expect(localStorage.getItem(WEB_AUTH_V2_MIGRATION_KEY)).toBe("1");
    expect(
      [...jar.values.keys()].some((name) =>
        isChunkLike(name, "sb-fixture-auth-token"),
      ),
    ).toBe(false);
  });

  it("never imports a late v1 write after completion or replaces v2 B", async () => {
    const jar = new CookieJar();
    const a = session(USER_A, "lineage-a");
    const b = session(USER_B, "lineage-b");
    vi.stubGlobal("document", jar);
    await expect(install(b)).resolves.toBe("installed");
    jar.install(a);

    await expect(
      withWebAccountOperationLock(migrateLegacyWebSession),
    ).resolves.toBe("already-complete");
    await expect(readActiveWebAuthSession()).resolves.toEqual(credential(b));
  });

  it("does not completion-mark malformed legacy auth", async () => {
    const jar = new CookieJar();
    jar.values.set("sb-fixture-auth-token", "not-json");
    vi.stubGlobal("document", jar);

    await expect(
      withWebAccountOperationLock(migrateLegacyWebSession),
    ).resolves.toBe("invalid");
    expect(localStorage.getItem(WEB_AUTH_V2_MIGRATION_KEY)).toBeNull();
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toBeNull();
  });

  it("retains the envelope but never completion-marks when cookie scrub fails", async () => {
    const jar = new StubbornCookieJar();
    const a = session(USER_A, "lineage-a");
    jar.install(a);
    vi.stubGlobal("document", jar);

    await expect(
      withWebAccountOperationLock(migrateLegacyWebSession),
    ).resolves.toBe("recovery-required");
    expect(localStorage.getItem(WEB_AUTH_V2_KEY)).toContain(
      '"mode":"installing"',
    );
    expect(localStorage.getItem(WEB_AUTH_V2_MIGRATION_KEY)).toBeNull();
  });

  it("retains terminal v2 auth until legacy credential scrub reads back", async () => {
    const jar = new StubbornCookieJar();
    const a = session(USER_A, "lineage-a");
    jar.install(a);
    vi.stubGlobal("document", jar);
    seed("signing-out", a);
    localStorage.setItem(WEB_AUTH_V2_MIGRATION_KEY, "1");

    await expect(
      withWebAccountOperationLock((handle) =>
        clearRevokedWebAuthSubject(handle, USER_A),
      ),
    ).resolves.toBe("unavailable");
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      mode: "signing-out",
    });
  });
});

describe("locks and content-free notification", () => {
  it("keeps guest storage untouched when a real browser lacks Web Locks", async () => {
    localStorage.setItem("guest-fixture", "kept");
    const browserDocument = {};
    vi.stubGlobal("document", browserDocument);
    vi.stubGlobal("window", {
      ...window,
      document: browserDocument,
      localStorage,
    });
    vi.stubGlobal("navigator", { onLine: true });
    const callback = vi.fn(async () => undefined);

    await expect(withWebAccountOperationLock(callback)).rejects.toBeInstanceOf(
      WebAuthUnavailableError,
    );
    expect(callback).not.toHaveBeenCalled();
    expect(localStorage.getItem("guest-fixture")).toBe("kept");
  });

  it("orders account-to-storage work and never replays a thrown callback", async () => {
    const calls: string[] = [];
    const operation = vi.fn(async () => {
      calls.push("account");
      await withWebAuthStorageLock(async () => {
        calls.push("storage");
      });
      throw new Error("fixture");
    });

    await expect(withWebAccountOperationLock(operation)).rejects.toThrow(
      "fixture",
    );
    expect(operation).toHaveBeenCalledOnce();
    expect(calls).toEqual(["account", "storage"]);
  });

  it("masks auth-js construction synchronously and emits only a content-free signal", async () => {
    const channels: Array<{ name: string; messages: unknown[] }> = [];
    class FixtureBroadcastChannel {
      readonly entry: { name: string; messages: unknown[] };
      onmessage: (() => void) | null = null;

      constructor(name: string) {
        this.entry = { name, messages: [] };
        channels.push(this.entry);
      }

      postMessage(value: unknown) {
        this.entry.messages.push(value);
      }

      close() {}
    }
    vi.stubGlobal("BroadcastChannel", FixtureBroadcastChannel);
    const before = Object.getOwnPropertyDescriptor(
      globalThis,
      "BroadcastChannel",
    );

    const constructed = constructWithoutAuthBroadcast(() => {
      expect(globalThis.BroadcastChannel).toBeUndefined();
      return { auth: "fixture" };
    });
    expect(constructed).toEqual({ auth: "fixture" });
    expect(Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel")).toEqual(
      before,
    );
    expect(channels).toHaveLength(0);

    const listener = vi.fn();
    const unsubscribe = subscribeWebAuthStorageChanges(listener);
    const a = session(USER_A, "lineage-a");
    await expect(install(a)).resolves.toBe("installed");
    unsubscribe();

    const posted = channels.flatMap((entry) => entry.messages);
    expect(posted).toContainEqual({ type: "changed", version: 2 });
    const serialized = JSON.stringify(posted);
    expect(serialized).not.toContain(USER_A);
    expect(serialized).not.toContain(a.access_token);
    expect(serialized).not.toContain(a.refresh_token);
  });

  it("catches notification constructor, post, event, and close failures", async () => {
    class FailingBroadcastChannel {
      onmessage: (() => void) | null = null;
      constructor(name: string) {
        expect(name).not.toBe("");
        throw new Error("fixture");
      }
      postMessage() {
        throw new Error("fixture");
      }
      close() {
        throw new Error("fixture");
      }
    }
    vi.stubGlobal("BroadcastChannel", FailingBroadcastChannel);
    vi.stubGlobal("window", {
      ...window,
      dispatchEvent: () => {
        throw new Error("fixture");
      },
      addEventListener: () => {
        throw new Error("fixture");
      },
      removeEventListener: () => {
        throw new Error("fixture");
      },
    });

    const unsubscribe = subscribeWebAuthStorageChanges(() => undefined);
    await expect(install(session(USER_A, "lineage-a"))).resolves.toBe(
      "installed",
    );
    expect(() => unsubscribe()).not.toThrow();
  });

  it("clears an exact credential but preserves a newer replacement", async () => {
    const a = session(USER_A, "lineage-a");
    const b = session(USER_B, "lineage-b");
    seed("active", b);

    await expect(
      withWebAccountOperationLock((handle) =>
        clearExactWebAuthSession(handle, credential(a)),
      ),
    ).resolves.toBe("different-session");
    await attest();
    await expect(readActiveWebAuthSession()).rejects.toBeInstanceOf(
      WebAuthUnavailableError,
    );
    await expect(readWebAuthState()).resolves.toMatchObject({
      status: "stored",
      credential: credential(b),
    });
  });

  it("refuses an externally rotated generation even before this realm adopts", async () => {
    vi.resetModules();
    localStorage.setItem(
      WEB_PRIVATE_WRITE_GENERATION_KEY,
      "10000000000000000000000000000000",
    );
    const storageModule = await import("@/lib/supabase/web-auth-storage");
    localStorage.setItem(
      storageModule.WEB_PRIVATE_WRITE_GENERATION_KEY,
      "20000000000000000000000000000000",
    );

    await expect(
      storageModule.withWebAccountOperationLock((handle) =>
        storageModule.adoptCurrentWebPrivateWriteGeneration(handle, null),
      ),
    ).resolves.toBe(false);
    expect(storageModule.beginWebPrivateWrite()).toBeNull();
  });
});
