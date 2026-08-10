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
  return SecureStorage;
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
    getItem: async (key) => (await loadBackend()).getItem(key),
    setItem: async (key, value) => (await loadBackend()).setItem(key, value),
    removeItem: async (key) => (await loadBackend()).removeItem(key),
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
  await (await loadBackend()).clear();
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
