import {
  PlatformConfigurationError,
  platformRuntime,
  validatedWebOrigin,
  type PlatformRuntime,
} from "@/lib/platform/runtime";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const BIBLEQUEST_AUTHORITY_HEADER_PREFIX = "x-biblequest-";

/** Marks a remote-only guest feature as unavailable without opening a transport. */
class GuestRemoteFeatureUnavailableError extends Error {
  constructor() {
    super("This feature is unavailable in this build.");
    this.name = "GuestRemoteFeatureUnavailableError";
  }
}

/** Restricts client requests to BibleQuest's internal API namespace. */
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

/** Builds one safe API URL for the pinned native origin. */
export function buildApiUrl(
  path: string,
  runtime: PlatformRuntime = platformRuntime(),
): string {
  const safePath = validatedApiPath(path);
  if (runtime.target === "web") return safePath;
  return new URL(safePath, validatedRuntimeOrigin(runtime)).toString();
}

/** Removes every caller-supplied identity or BibleQuest authority header. */
function publicHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  for (const name of [...headers.keys()]) {
    if (
      name === "authorization" ||
      name.startsWith(BIBLEQUEST_AUTHORITY_HEADER_PREFIX)
    ) {
      headers.delete(name);
    }
  }
  return headers;
}

/** Sends a public request without cookies or caller authority. */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(buildApiUrl(path), {
    ...init,
    credentials: "omit",
    headers: publicHeaders(init?.headers),
  });
}

/** Refuses every private remote request in the device-only guest build. */
export function authenticatedApiFetch(
  expectedUserId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  void [expectedUserId, path, init];
  return Promise.reject(new GuestRemoteFeatureUnavailableError());
}

/** Refuses the deletion-only remote transport in the device-only guest build. */
export function accountDeletionAvatarFetch(
  expectedUserId: string,
  signal?: AbortSignal,
  webOperation?: unknown,
): Promise<Response> {
  void [expectedUserId, signal, webOperation];
  return Promise.reject(new GuestRemoteFeatureUnavailableError());
}

/** Builds a share-safe public link against the pinned native origin. */
export function buildPublicUrl(
  path: string,
  options: { runtime?: PlatformRuntime; webOrigin?: string } = {},
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

/** Keeps public links relative on web and external HTTPS links on native. */
export function buildPublicHref(
  path: string,
  runtime: PlatformRuntime = platformRuntime(),
): string {
  const safePath = validatedPublicPath(path);
  if (runtime.target === "web") return safePath;
  return new URL(safePath, validatedRuntimeOrigin(runtime)).toString();
}

/** Requires native construction to carry one bare HTTPS origin. */
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

/** Rejects escaped, fragmented, or external public destinations. */
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
