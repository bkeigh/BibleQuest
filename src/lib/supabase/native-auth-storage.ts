/**
 * Keychain-backed Supabase auth storage for the installed iOS app.
 *
 * The WebView's cookie API is a measured no-op at `capacitor://localhost`, and
 * localStorage is not an acceptable home for refresh credentials. Native auth
 * therefore uses Supabase's asynchronous storage contract and keeps its
 * session plus PKCE verifier under one app-specific, non-iCloud Keychain
 * prefix. Web builds never import or initialize the native plugin.
 */
import { isNativeTarget } from "@/lib/platform/target";

const AUTH_KEY_PREFIX = "biblequest_auth_";
const LEGACY_COOKIE_STORE_KEY = "biblequest:native-auth-cookies";

/** Minimal async storage contract accepted by `@supabase/supabase-js`. */
export interface NativeAuthStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/** Internal backend adds a prefix-scoped clear for account deletion. */
export interface NativeAuthStorageBackend extends NativeAuthStorage {
  clear: () => Promise<void>;
}

type BackendLoader = () => Promise<NativeAuthStorageBackend>;

let nativeBackend: Promise<NativeAuthStorageBackend> | null = null;
let nativeStorageOperations: Promise<void> = Promise.resolve();
const terminallyDeletedUsers = new Set<string>();

export type ExpectedCredentialClearResult =
  | "cleared"
  | "different-user"
  | "not-native"
  | "unavailable";

export interface ExactNativeAuthSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export type ExactCredentialClearResult =
  | "cleared"
  | "different-session"
  | "missing"
  | "not-native"
  | "unavailable";

/** Serialize adapters with compare-and-clear so a newer session cannot race it. */
function serializeNativeStorageOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = nativeStorageOperations.then(operation, operation);
  nativeStorageOperations = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Read only the owner identifier from a persisted Supabase session value. */
function persistedSessionUserId(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const user = (parsed as { user?: unknown }).user;
    if (!user || typeof user !== "object" || Array.isArray(user)) return null;
    const id = (user as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 && id.length <= 128
      ? id
      : null;
  } catch {
    return null;
  }
}

/** Parse the exact credential fields needed for a non-terminal comparison. */
function persistedSessionCredential(
  value: string,
): ExactNativeAuthSession | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const userId = persistedSessionUserId(value);
    const accessToken = record.access_token;
    const refreshToken = record.refresh_token;
    if (
      !userId ||
      typeof accessToken !== "string" ||
      !accessToken ||
      typeof refreshToken !== "string" ||
      !refreshToken
    ) {
      return null;
    }
    return { accessToken, refreshToken, userId };
  } catch {
    return null;
  }
}

/** Compare credential values without ever exposing them to logs or errors. */
function exactSessionMatches(
  left: ExactNativeAuthSession,
  right: ExactNativeAuthSession,
): boolean {
  return (
    left.userId === right.userId &&
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken
  );
}

/** Match the default storage key constructed by supabase-js for this origin. */
function supabaseAuthStorageKey(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) return null;
    const project = url.hostname.split(".")[0];
    return project ? `sb-${project}-auth-token` : null;
  } catch {
    return null;
  }
}

/** Removes the obsolete plaintext cookie blob on every native startup. */
export function clearLegacyNativeAuthStorage(
  storage?: Pick<Storage, "removeItem">,
): void {
  if (!isNativeTarget()) return;
  try {
    (storage ?? window.localStorage).removeItem(LEGACY_COOKIE_STORE_KEY);
  } catch {
    // Storage remains unreachable in this context; startup retries next time.
  }
}

/**
 * Initializes the native plugin once. Errors deliberately propagate so an
 * unavailable Keychain cannot silently downgrade credentials to web storage.
 */
async function loadNativeBackend(): Promise<NativeAuthStorageBackend> {
  const [{ Capacitor }, { KeychainAccess, SecureStorage }] = await Promise.all([
    import("@capacitor/core"),
    import("@aparajita/capacitor-secure-storage"),
  ]);

  if (!Capacitor.isNativePlatform()) {
    throw new Error("Native auth storage requires an installed app runtime.");
  }

  await SecureStorage.setKeyPrefix(AUTH_KEY_PREFIX);
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setDefaultKeychainAccess(
    KeychainAccess.whenUnlockedThisDeviceOnly,
  );
  clearLegacyNativeAuthStorage();
  // Never hand the Capacitor plugin proxy back through a promise. Its `get`
  // trap answers every unknown property with a native method wrapper —
  // including `then` — which makes the proxy a thenable. Resolving a promise
  // with it makes the runtime "adopt" it by invoking a native `then` that does
  // not exist, so the promise never settles: the Keychain read hangs forever,
  // Supabase never emits an auth event, and the sign-in screen never appears.
  // Observed on iOS on 2026-08-15. Delegating through a plain object keeps the
  // proxy out of promise resolution entirely.
  return {
    getItem: (key) => SecureStorage.getItem(key),
    setItem: (key, value) => SecureStorage.setItem(key, value),
    removeItem: (key) => SecureStorage.removeItem(key),
    clear: () => SecureStorage.clear(),
  };
}

function defaultBackend(): Promise<NativeAuthStorageBackend> {
  nativeBackend ??= loadNativeBackend();
  return nativeBackend;
}

/** Creates a lazy adapter so plugin work starts only when Supabase needs it. */
export function createNativeAuthStorage(
  loadBackend: BackendLoader = defaultBackend,
): NativeAuthStorage {
  return {
    getItem: (key) =>
      serializeNativeStorageOperation(async () =>
        (await loadBackend()).getItem(key),
      ),
    setItem: (key, value) =>
      serializeNativeStorageOperation(async () => {
        // A refresh response that outlives terminal deletion may not reinstall
        // that account after its credential was atomically removed.
        const userId = persistedSessionUserId(value);
        if (userId && terminallyDeletedUsers.has(userId)) return;
        await (await loadBackend()).setItem(key, value);
      }),
    removeItem: (key) =>
      serializeNativeStorageOperation(async () =>
        (await loadBackend()).removeItem(key),
      ),
  };
}

/**
 * Clears every Keychain item owned by native auth after confirmed account
 * deletion. Ordinary sign-out remains Supabase's responsibility so a failed
 * remote revoke cannot be presented as success.
 */
export async function clearNativeAuthStorage(
  loadBackend: BackendLoader = defaultBackend,
): Promise<void> {
  clearLegacyNativeAuthStorage();
  if (!isNativeTarget()) return;
  await serializeNativeStorageOperation(async () =>
    (await loadBackend()).clear(),
  );
}

/**
 * Compare and clear one terminal account under the adapter's storage queue.
 * A different persisted subject is never erased, and stale writes for the
 * deleted subject stay blocked for the rest of this installed-app process.
 */
export async function clearNativeAuthStorageForUser(
  expectedUserId: string,
  supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  loadBackend: BackendLoader = defaultBackend,
): Promise<ExpectedCredentialClearResult> {
  clearLegacyNativeAuthStorage();
  if (!isNativeTarget()) return "not-native";
  const storageKey = supabaseAuthStorageKey(supabaseOrigin);
  if (!storageKey || !expectedUserId || expectedUserId.length > 128) {
    return "unavailable";
  }

  terminallyDeletedUsers.add(expectedUserId);
  try {
    return await serializeNativeStorageOperation(async () => {
      const backend = await loadBackend();
      const persisted = await backend.getItem(storageKey);
      if (persisted !== null) {
        const persistedUserId = persistedSessionUserId(persisted);
        if (!persistedUserId) return "unavailable";
        if (persistedUserId !== expectedUserId) return "different-user";
      }
      await backend.clear();
      return "cleared";
    });
  } catch {
    return "unavailable";
  }
}

/**
 * Remove one exact non-terminal session under the native storage queue.
 * A rotated or different credential wins and is left untouched.
 */
export async function clearExactNativeAuthSession(
  expected: ExactNativeAuthSession,
  supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  loadBackend: BackendLoader = defaultBackend,
): Promise<ExactCredentialClearResult> {
  if (!isNativeTarget()) return "not-native";
  const storageKey = supabaseAuthStorageKey(supabaseOrigin);
  if (
    !storageKey ||
    !expected.userId ||
    expected.userId.length > 128 ||
    !expected.accessToken ||
    !expected.refreshToken
  ) {
    return "unavailable";
  }

  try {
    return await serializeNativeStorageOperation(async () => {
      const backend = await loadBackend();
      const persisted = await backend.getItem(storageKey);
      if (persisted === null) return "missing";
      const current = persistedSessionCredential(persisted);
      if (!current) return "unavailable";
      if (!exactSessionMatches(current, expected)) return "different-session";
      await backend.removeItem(storageKey);
      return (await backend.getItem(storageKey)) === null
        ? "cleared"
        : "unavailable";
    });
  } catch {
    return "unavailable";
  }
}

/** Native-only auth options; web keeps the SSR client's cookie behavior. */
export function nativeSupabaseAuthOptions(): {
  auth: {
    storage: NativeAuthStorage;
    persistSession: true;
    autoRefreshToken: true;
    detectSessionInUrl: false;
    flowType: "pkce";
  };
} {
  return {
    auth: {
      storage: createNativeAuthStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  };
}
