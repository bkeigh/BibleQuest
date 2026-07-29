import { authCallbackPath, safeNextPath } from "@/lib/auth/redirect";
import {
  PlatformConfigurationError,
  platformRuntime,
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

  const configured =
    options.nativeCallbackUrl ??
    process.env.NEXT_PUBLIC_NATIVE_AUTH_CALLBACK_URL;
  const callback = validatedNativeCallback(configured);
  callback.searchParams.set("next", safeNextPath(nextPath));
  return callback.toString();
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
