/**
 * Session storage for the iOS bundle, standing in for `document.cookie`.
 *
 * MEASURED on device (iPhone 17 Pro, iOS 26.5, Capacitor 8.5.0): at
 * `capacitor://localhost`, `document.cookie` is a SILENT NO-OP — a write
 * followed immediately by a read returns nothing, and a 3500-byte value stores
 * 0 bytes. `@supabase/ssr`'s `createBrowserClient` persists the whole session
 * (and the PKCE code verifier) through that API, so without this adapter
 * sign-in appears to succeed and the session vanishes on the next read.
 *
 * Why the `cookies` option rather than `auth.storage`: `createBrowserClient`
 * writes `storage` and `flowType` AFTER spreading the caller's `auth` options,
 * so a supplied `auth.storage` is discarded. The `cookies` pair is consumed
 * earlier by `createStorageFromOptions` and IS honored. Using it also keeps
 * the ssr package's chunking and base64 handling, and keeps the storage key
 * names identical to web.
 *
 * Durability note: this is backed by localStorage, which iOS can reclaim under
 * storage pressure — the same hazard the journey mirror addresses. A lost
 * session only costs a re-sign-in, which is recoverable, whereas a lost
 * journal is not; that is why the journey gets a filesystem mirror and this
 * does not. Moving to the Keychain remains the readiness doc's requirement
 * before any release that stores refresh credentials.
 */
import { isNativeTarget } from "@/lib/platform/target";

const STORE_KEY = "biblequest:native-auth-cookies";

interface StoredCookie {
  name: string;
  value: string;
}

/** The subset of `@supabase/ssr`'s cookie options this adapter acts on. */
interface CookieOptionsLike {
  maxAge?: number;
}

interface CookieToSet extends StoredCookie {
  options?: CookieOptionsLike;
}

function readAll(): StoredCookie[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredCookie =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StoredCookie).name === "string" &&
        typeof (entry as StoredCookie).value === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(cookies: StoredCookie[]): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(cookies));
  } catch {
    // Full or unavailable storage degrades to an in-memory session: the user
    // stays signed in for this launch and signs in again next time. Throwing
    // here would break sign-in outright, which is strictly worse.
  }
}

export interface NativeCookieAdapter {
  getAll: () => StoredCookie[];
  setAll: (cookies: CookieToSet[]) => void;
}

export function nativeCookieStorage(): NativeCookieAdapter {
  return {
    getAll: () => readAll(),
    setAll: (cookies) => {
      const next = new Map(readAll().map((c) => [c.name, c.value]));
      for (const cookie of cookies) {
        // `@supabase/ssr` signals removal by rewriting the cookie with
        // maxAge 0 rather than calling a delete method, so an expiring write
        // must delete rather than store an empty value — otherwise sign-out
        // would leave a husk that reads back as a live session.
        if (cookie.options?.maxAge === 0 || cookie.value === "") {
          next.delete(cookie.name);
          continue;
        }
        next.set(cookie.name, cookie.value);
      }
      writeAll([...next].map(([name, value]) => ({ name, value })));
    },
  };
}

/** Clears every stored auth cookie. Used by sign-out repair paths. */
export function clearNativeCookieStorage(): void {
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing to do — the caller is already tearing the session down.
  }
}

/**
 * The options to hand `createBrowserClient`. Empty on web, so the browser
 * keeps using `document.cookie` exactly as it does today and the adapter folds
 * out of the web bundle.
 */
export function nativeAuthClientOptions(): { cookies?: NativeCookieAdapter } {
  return isNativeTarget() ? { cookies: nativeCookieStorage() } : {};
}
