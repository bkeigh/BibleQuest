import { authCallbackPath, safeNextPath } from "@/lib/auth/redirect";
import {
  PlatformConfigurationError,
  platformRuntime,
  validatedHostedOrigin,
  validatedWebOrigin,
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

/** Resolves the current web OAuth callback or one exact native deep link. */
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

  // Native OAuth needs an app deep link. Until that contract is configured,
  // use the reviewed hosted callback so sign-in fails safely in Safari rather
  // than constructing an untrusted or partially configured native URL.
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
