import {
  PlatformConfigurationError,
  platformRuntime,
  validatedWebOrigin,
  type PlatformRuntime,
} from "./runtime";
import { isNativeTarget } from "./target";
import {
  ACCOUNT_SYNC_CONTAINED,
  NATIVE_ACCOUNT_ENABLED,
} from "@/lib/sync/containment";
import {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_REQUEST_HEADERS,
  nativeAccountBuildContract,
} from "@/lib/sync/native-beta-headers";
import { NativeAccountBetaUnavailableError } from "@/lib/sync/native-beta-contract";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Restricts client API requests to BibleQuest's internal API namespace. */
export function validatedApiPath(path: string): string {
  if (
    !path.startsWith("/api/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    CONTROL_CHARACTERS.test(path)
  ) {
    throw new PlatformConfigurationError();
  }

  try {
    const base = new URL("https://biblequest.invalid");
    const resolved = new URL(path, base);
    if (
      resolved.origin !== base.origin ||
      !resolved.pathname.startsWith("/api/") ||
      resolved.hash
    ) {
      throw new PlatformConfigurationError();
    }
    return path;
  } catch (error) {
    if (error instanceof PlatformConfigurationError) throw error;
    throw new PlatformConfigurationError();
  }
}

/** Keeps web requests relative and points a future local native bundle at hosted HTTPS. */
export function buildApiUrl(
  path: string,
  runtime: PlatformRuntime = platformRuntime(),
): string {
  const safePath = validatedApiPath(path);
  if (runtime.target === "web") return safePath;
  const origin = validatedRuntimeOrigin(runtime);
  return new URL(safePath, origin).toString();
}

/** Centralizes client API routing without changing fetch options or response handling. */
export function apiFetch(
  path: string,
  init?: RequestInit,
  expectedNativeUserId?: string,
): Promise<Response> {
  // Validate before branching so an invalid path throws synchronously on both
  // targets, exactly as before. The web branch stays one verbatim fetch with
  // the caller's own init reference.
  const url = buildApiUrl(path);
  if (!isNativeTarget()) return fetch(url, init);
  if (expectedNativeUserId !== undefined) {
    if (!UUID.test(expectedNativeUserId)) {
      return Promise.reject(new NativeAccountBetaUnavailableError());
    }
    const headers = new Headers(init?.headers);
    headers.set(EXPECTED_ACCOUNT_USER_HEADER, expectedNativeUserId);
    return nativeAuthenticatedApiFetch(
      url,
      expectedNativeUserId,
      init,
      headers,
    );
  }
  return nativePublicApiFetch(url, init);
}

/**
 * Sends a caller-captured account request. Native checks the live beta switch
 * before reading Keychain, then binds the bearer to that exact subject. Web
 * keeps cookie auth but receives the same expected-subject server boundary.
 */
export function authenticatedApiFetch(
  expectedUserId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!UUID.test(expectedUserId)) {
    return Promise.reject(new NativeAccountBetaUnavailableError());
  }
  const url = buildApiUrl(path);
  const headers = new Headers(init?.headers);
  headers.set(EXPECTED_ACCOUNT_USER_HEADER, expectedUserId);
  if (!isNativeTarget()) return fetch(url, { ...init, headers });
  return nativeAuthenticatedApiFetch(url, expectedUserId, init, headers);
}

/**
 * Carries only the explicit account-deletion avatar sweep while the live beta
 * switch is off. The path, verb, body, cleanup marker, and subject are fixed;
 * no other account request can use this exception.
 */
export function accountDeletionAvatarFetch(
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<Response> {
  if (!UUID.test(expectedUserId)) {
    return Promise.reject(new NativeAccountBetaUnavailableError());
  }
  const url = buildApiUrl("/api/profile/avatar");
  const init: RequestInit = {
    method: "DELETE",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      [EXPECTED_ACCOUNT_USER_HEADER]: expectedUserId,
      [ACCOUNT_DELETION_CLEANUP_HEADER]:
        ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
    },
    body: JSON.stringify({ allOwnedObjects: true }),
    signal,
  };
  if (!isNativeTarget()) return fetch(url, init);
  return nativeAuthenticatedApiFetch(
    url,
    expectedUserId,
    init,
    new Headers(init.headers),
    true,
  );
}

/**
 * Native public requests never inspect Keychain or carry account markers.
 * Removing reserved headers also prevents a future caller from accidentally
 * turning the public helper into a stale-session transport.
 */
function nativePublicApiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const reserved of [
    "authorization",
    EXPECTED_ACCOUNT_USER_HEADER,
    ...NATIVE_ACCOUNT_REQUEST_HEADERS,
    ACCOUNT_DELETION_CLEANUP_HEADER,
  ]) {
    headers.delete(reserved);
  }
  return fetch(url, { ...init, headers });
}

/** Rechecks the live Keychain-backed account before a billing side effect. */
export async function nativeSessionMatches(
  expectedUserId: string,
): Promise<boolean> {
  if (
    !isNativeTarget() ||
    !UUID.test(expectedUserId) ||
    ACCOUNT_SYNC_CONTAINED ||
    !NATIVE_ACCOUNT_ENABLED
  ) {
    return false;
  }
  try {
    const { requireNativeAccountBetaAvailability } = await import(
      "@/lib/sync/availability"
    );
    await requireNativeAccountBetaAvailability();
    const identity = await nativeSessionIdentity();
    return identity?.userId === expectedUserId;
  } catch {
    return false;
  }
}

/** Reads only a valid native session identity from the configured client. */
async function nativeSessionIdentity(): Promise<{
  accessToken: string;
  userId: string;
} | null> {
  if (ACCOUNT_SYNC_CONTAINED || !NATIVE_ACCOUNT_ENABLED) return null;
  try {
    const { createClient, isSupabaseConfigured } = await import(
      "@/lib/supabase/client"
    );
    if (!isSupabaseConfigured()) return null;
    const { data, error } = await createClient().auth.getSession();
    const session = data.session;
    if (error || !session?.access_token || !UUID.test(session.user.id)) {
      return null;
    }
    return { accessToken: session.access_token, userId: session.user.id };
  } catch {
    return null;
  }
}

/** Attach one live, exact-user bearer after the anonymous availability probe. */
async function nativeAuthenticatedApiFetch(
  url: string,
  expectedUserId: string,
  init: RequestInit | undefined,
  headers: Headers,
  deletionOnly = false,
): Promise<Response> {
  if (ACCOUNT_SYNC_CONTAINED || !NATIVE_ACCOUNT_ENABLED) {
    throw new NativeAccountBetaUnavailableError();
  }
  if (!deletionOnly) {
    const { requireNativeAccountBetaAvailability } = await import(
      "@/lib/sync/availability"
    );
    await requireNativeAccountBetaAvailability();
  }

  const identity = await nativeSessionIdentity();
  if (!identity || identity.userId !== expectedUserId) {
    throw new NativeAccountBetaUnavailableError();
  }
  const contract = nativeAccountBuildContract();
  if (!contract) throw new NativeAccountBetaUnavailableError();
  headers.set(contract.header, contract.value);
  headers.set("Authorization", `Bearer ${identity.accessToken}`);
  return fetch(url, { ...init, credentials: "omit", headers });
}

/** Builds share-safe public links against the web page or the native hosted origin. */
export function buildPublicUrl(
  path: string,
  options: {
    runtime?: PlatformRuntime;
    webOrigin?: string;
  } = {},
): string {
  const runtime = options.runtime ?? platformRuntime();
  const safePath = validatedPublicPath(path);
  const origin =
    runtime.target === "native"
      ? validatedRuntimeOrigin(runtime)
      : validatedWebOrigin(
          options.webOrigin ??
            (typeof window !== "undefined" ? window.location.origin : ""),
        );
  return new URL(safePath, origin).toString();
}

/** Keeps hosted links relative on web and makes them external HTTPS links on native. */
export function buildPublicHref(
  path: string,
  runtime: PlatformRuntime = platformRuntime(),
): string {
  const safePath = validatedPublicPath(path);
  if (runtime.target === "web") return safePath;
  return new URL(safePath, validatedRuntimeOrigin(runtime)).toString();
}

/** Requires native runtime construction to carry a previously validated origin. */
function validatedRuntimeOrigin(runtime: PlatformRuntime): string {
  if (runtime.target !== "native" || !runtime.hostedOrigin) {
    throw new PlatformConfigurationError();
  }
  try {
    const url = new URL(runtime.hostedOrigin);
    if (
      url.protocol !== "https:" ||
      url.origin !== runtime.hostedOrigin ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new PlatformConfigurationError();
    }
    return url.origin;
  } catch (error) {
    if (error instanceof PlatformConfigurationError) throw error;
    throw new PlatformConfigurationError();
  }
}

/** Rejects protocol-relative, escaped, fragmented, or non-app public destinations. */
function validatedPublicPath(path: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    CONTROL_CHARACTERS.test(path)
  ) {
    throw new PlatformConfigurationError();
  }
  try {
    const base = new URL("https://biblequest.invalid");
    const resolved = new URL(path, base);
    if (resolved.origin !== base.origin || resolved.hash) {
      throw new PlatformConfigurationError();
    }
    return path;
  } catch (error) {
    if (error instanceof PlatformConfigurationError) throw error;
    throw new PlatformConfigurationError();
  }
}
