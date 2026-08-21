import {
  PlatformConfigurationError,
  platformRuntime,
  validatedWebOrigin,
  type PlatformRuntime,
} from "./runtime";
import { isNativeTarget } from "./target";
import {
  ACCOUNT_SYNC_CONTAINED,
  NATIVE_ACCOUNT_BETA_ENABLED,
} from "@/lib/sync/containment";
import {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
} from "@/lib/sync/native-beta-headers";
import { NativeAccountBetaUnavailableError } from "@/lib/sync/native-beta-contract";
import type { WebAccountOperationHandle } from "@/lib/supabase/web-auth-storage";
import {
  WEB_AUTH_PROTOCOL_HEADER,
  WEB_AUTH_PROTOCOL_VERSION,
} from "@/lib/supabase/web-auth-protocol";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVED_ACCOUNT_HEADERS = ["authorization"] as const;
const BIBLEQUEST_AUTHORITY_HEADER_PREFIX = "x-biblequest-";

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

/** Sends a public request without cookies or caller-supplied account authority. */
export function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = buildApiUrl(path);
  return publicApiFetch(url, init);
}

/**
 * Sends a caller-captured account request. Both targets bind an explicit
 * bearer to the exact subject and omit cookies; native additionally checks its
 * live beta switch before reading Keychain.
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
  const headers = publicHeaders(init?.headers);
  headers.set(EXPECTED_ACCOUNT_USER_HEADER, expectedUserId);
  if (!isNativeTarget()) {
    headers.set(WEB_AUTH_PROTOCOL_HEADER, WEB_AUTH_PROTOCOL_VERSION);
    return webAuthenticatedApiFetch(url, expectedUserId, init, headers);
  }
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
  webOperation?: WebAccountOperationHandle,
): Promise<Response> {
  if (!UUID.test(expectedUserId)) {
    return Promise.reject(new NativeAccountBetaUnavailableError());
  }
  const url = buildApiUrl("/api/profile/avatar");
  const headers = publicHeaders({ "Content-Type": "application/json" });
  headers.set(EXPECTED_ACCOUNT_USER_HEADER, expectedUserId);
  headers.set(
    ACCOUNT_DELETION_CLEANUP_HEADER,
    ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
  );
  const init: RequestInit = {
    method: "DELETE",
    cache: "no-store",
    credentials: "omit",
    headers,
    body: JSON.stringify({ allOwnedObjects: true }),
    signal,
  };
  if (!isNativeTarget()) {
    if (!webOperation) {
      return Promise.reject(new NativeAccountBetaUnavailableError());
    }
    headers.set(WEB_AUTH_PROTOCOL_HEADER, WEB_AUTH_PROTOCOL_VERSION);
    return webDeletionApiFetch(
      url,
      expectedUserId,
      init,
      headers,
      webOperation,
    );
  }
  return nativeAuthenticatedApiFetch(
    url,
    expectedUserId,
    init,
    new Headers(init.headers),
    true,
  );
}

/**
 * Public requests never inspect auth storage or carry account markers.
 * Removing reserved headers prevents a caller from turning the public helper
 * into a stale-session transport.
 */
function publicApiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: "omit",
    headers: publicHeaders(init?.headers),
  });
}

/** Removes every header reserved for an authenticated account transport. */
function publicHeaders(source?: HeadersInit): Headers {
  const headers = new Headers(source);
  for (const reserved of RESERVED_ACCOUNT_HEADERS) headers.delete(reserved);
  // Drop current and future internal authority before trusted code adds its own.
  for (const name of [...headers.keys()]) {
    if (name.startsWith(BIBLEQUEST_AUTHORITY_HEADER_PREFIX)) {
      headers.delete(name);
    }
  }
  return headers;
}

/** Reads only the exact active v2 browser credential for one captured user. */
async function webAuthenticatedApiFetch(
  url: string,
  expectedUserId: string,
  init: RequestInit | undefined,
  headers: Headers,
): Promise<Response> {
  const { readActiveWebAuthSession } = await import(
    "@/lib/supabase/web-auth-storage"
  );
  const session = await readActiveWebAuthSession();
  if (!session) throw new NativeAccountBetaUnavailableError();
  return webSessionApiFetch(url, expectedUserId, init, headers, session);
}

/** Uses only the retained deleting credential held by the outer account lock. */
async function webDeletionApiFetch(
  url: string,
  expectedUserId: string,
  init: RequestInit,
  headers: Headers,
  webOperation: WebAccountOperationHandle,
): Promise<Response> {
  const { readExpectedWebAuthSession } = await import(
    "@/lib/supabase/web-auth-storage"
  );
  const session = await readExpectedWebAuthSession(
    expectedUserId,
    ["deleting"],
    webOperation,
  );
  return webSessionApiFetch(url, expectedUserId, init, headers, session);
}

/** Binds one exact retained browser credential to its caller-captured owner. */
function webSessionApiFetch(
  url: string,
  expectedUserId: string,
  init: RequestInit | undefined,
  headers: Headers,
  session: { accessToken: string; userId: string },
): Promise<Response> {
  if (session.userId !== expectedUserId || !session.accessToken) {
    throw new NativeAccountBetaUnavailableError();
  }
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  return fetch(url, { ...init, credentials: "omit", headers });
}

/** Attach one live, exact-user bearer after the anonymous availability probe. */
async function nativeAuthenticatedApiFetch(
  url: string,
  expectedUserId: string,
  init: RequestInit | undefined,
  headers: Headers,
  deletionOnly = false,
): Promise<Response> {
  if (ACCOUNT_SYNC_CONTAINED || !NATIVE_ACCOUNT_BETA_ENABLED) {
    throw new NativeAccountBetaUnavailableError();
  }
  if (!deletionOnly) {
    const { requireNativeAccountBetaAvailability } = await import(
      "@/lib/sync/availability"
    );
    await requireNativeAccountBetaAvailability();
  }

  const { createClient, isSupabaseConfigured } = await import(
    "@/lib/supabase/client"
  );
  if (!isSupabaseConfigured()) throw new NativeAccountBetaUnavailableError();
  const { data, error } = await createClient().auth.getSession();
  const session = data.session;
  if (
    error ||
    !session ||
    session.user.id !== expectedUserId ||
    !session.access_token
  ) {
    throw new NativeAccountBetaUnavailableError();
  }
  headers.set(NATIVE_ACCOUNT_BETA_HEADER, NATIVE_ACCOUNT_BETA_HEADER_VALUE);
  headers.set("Authorization", `Bearer ${session.access_token}`);
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
