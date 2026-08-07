import { authCallbackPath, safeNextPath } from "@/lib/auth/redirect";
import {
  PlatformConfigurationError,
  platformRuntime,
  validatedHostedOrigin,
  type PlatformRuntime,
} from "./runtime";

const NATIVE_AUTH_PROTOCOL = "biblequest:";
const NATIVE_AUTH_HOST = "auth";
const NATIVE_AUTH_PATH = "/callback";

export interface AuthCallbackOptions {
  runtime?: PlatformRuntime;
  webOrigin?: string;
  nativeCallbackUrl?: string;
}

/** Resolves the current web callback or one exact future BibleQuest deep link. */
export function resolveAuthCallbackUrl(
  nextPath: string | null,
  options: AuthCallbackOptions = {},
): string {
  const runtime = options.runtime ?? platformRuntime();
  if (runtime.target === "web") {
    const origin =
      options.webOrigin ??
      (typeof window !== "undefined" ? window.location.origin : "");
    return new URL(authCallbackPath(nextPath), validatedWebOrigin(origin)).toString();
  }

  // A deep link may be configured explicitly; when it is not — which is the
  // normal case — fall back to the reviewed hosted callback rather than
  // throwing. Three reasons this is the better default:
  //
  //   1. Throwing here breaks sign-in before any network call, and the caller
  //      swallows the error into a generic notice, so the symptom never points
  //      at the cause.
  //   2. The magic-link template appends `&token_hash=...` to this URL, so an
  //      absent or query-less redirect produces a malformed link. The hosted
  //      callback already carries `?next=`.
  //   3. It needs no CFBundleURLTypes scheme, no appUrlOpen listener and no
  //      new Supabase redirect-allowlist entry.
  //
  // Note the consequence: an emailed LINK completes in Safari, not in the app.
  // The in-app path is the emailed numeric code, which is a pure XHR
  // (`verifyOtp`) with no redirect at all. A deep link is still required
  // before OAuth can complete in-app.
  const configured =
    options.nativeCallbackUrl ??
    process.env.NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL;
  if (configured) {
    const callback = validatedNativeCallback(configured);
    callback.searchParams.set("next", safeNextPath(nextPath));
    return callback.toString();
  }
  return new URL(
    authCallbackPath(nextPath),
    validatedHostedOrigin(runtime.hostedOrigin),
  ).toString();
}

/** Keeps browser auth on an exact HTTP(S) origin, including localhost development. */
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

/** Allows only biblequest://auth/callback with no preloaded query or fragment. */
function validatedNativeCallback(value: string | undefined): URL {
  if (!value) throw new PlatformConfigurationError();
  try {
    const url = new URL(value);
    if (
      url.protocol !== NATIVE_AUTH_PROTOCOL ||
      url.hostname !== NATIVE_AUTH_HOST ||
      url.pathname !== NATIVE_AUTH_PATH ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      throw new PlatformConfigurationError();
    }
    return url;
  } catch (error) {
    if (error instanceof PlatformConfigurationError) throw error;
    throw new PlatformConfigurationError();
  }
}
