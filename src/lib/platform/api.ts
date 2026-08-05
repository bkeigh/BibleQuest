import {
  PlatformConfigurationError,
  platformRuntime,
  type PlatformRuntime,
} from "./runtime";
import { isNativeTarget } from "./target";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

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
): Promise<Response> {
  // Validate before branching so an invalid path throws synchronously on both
  // targets, exactly as before. The web branch stays one verbatim fetch with
  // the caller's own init reference.
  const url = buildApiUrl(path);
  if (!isNativeTarget()) return fetch(url, init);
  return nativeApiFetch(url, init);
}

/**
 * Native requests are cross-origin, so the cookie session never rides; the
 * account travels as a bearer token instead. Headers MERGE via the caller's
 * init — never set Content-Type here, because the avatar upload deliberately
 * omits it so the browser generates the multipart boundary.
 */
async function nativeApiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    const token = await nativeSessionAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}

/**
 * Reads the current session token, or null for guests, misconfiguration, and
 * every failure — a request without a token simply answers 401 server-side.
 * The dynamic import keeps supabase-js out of web chunks that only route API
 * calls (chunking hygiene, not a security boundary: on web the guarantee is
 * the runtime no-op — isNativeTarget() is false, so this import never
 * executes; whether the minifier also drops the branch is minifier-dependent).
 */
async function nativeSessionAccessToken(): Promise<string | null> {
  try {
    const { createClient, isSupabaseConfigured } = await import(
      "@/lib/supabase/client"
    );
    if (!isSupabaseConfigured()) return null;
    // getSession refreshes an expired access token before returning it.
    const { data, error } = await createClient().auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
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

/** Allows HTTPS production and HTTP local development while rejecting non-web schemes. */
function validatedWebOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
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
