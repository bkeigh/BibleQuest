import "server-only";

import {
  createClient,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { parsedBearerToken } from "@/lib/http/bearer-token";
import {
  isNativeAppOrigin,
  NATIVE_APP_ORIGIN,
} from "@/lib/http/native-origin";
import { privateError } from "@/lib/http/request";
import { recordServerFailure } from "@/lib/observability/server-failures";
import { supabasePublishableKey } from "@/lib/supabase/config";
import { isSupabaseConfigured } from "@/lib/supabase/configuration";
import {
  WEB_AUTH_PROTOCOL_HEADER,
  WEB_AUTH_PROTOCOL_VERSION,
} from "@/lib/supabase/web-auth-protocol";
import {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
} from "@/lib/sync/native-beta-headers";
import { requireAccountWireHeader } from "@/lib/sync/native-account-markers.mjs";

type AuthenticatedContext = {
  supabase: SupabaseClient;
  storageSupabase: SupabaseClient;
  user: User;
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Enforce an optional caller-captured owner before any account route runs. */
function expectedUserBoundary(
  request: Request,
  user: User,
  required = false,
): Response | null {
  const expected = request.headers.get(EXPECTED_ACCOUNT_USER_HEADER);
  if (expected === null) {
    return required ? privateError("forbidden", 403) : null;
  }
  return UUID.test(expected) && expected === user.id
    ? null
    : privateError("forbidden", 403);
}

/** Forward only reviewed account-boundary headers into PostgREST requests. */
function databaseBoundaryHeaders(
  request: Request,
  native: boolean,
): Record<string, string> {
  const expected = request.headers.get(EXPECTED_ACCOUNT_USER_HEADER);
  const cleanup = request.headers.get(ACCOUNT_DELETION_CLEANUP_HEADER);
  const webProtocol = request.headers.get(WEB_AUTH_PROTOCOL_HEADER);
  return {
    ...(expected && UUID.test(expected)
      ? { [requireAccountWireHeader(EXPECTED_ACCOUNT_USER_HEADER)]: expected }
      : {}),
    ...(cleanup === ACCOUNT_DELETION_CLEANUP_HEADER_VALUE
      ? {
          [requireAccountWireHeader(ACCOUNT_DELETION_CLEANUP_HEADER)]:
            cleanup,
        }
      : {}),
    ...(!native && webProtocol === WEB_AUTH_PROTOCOL_VERSION
      ? { [requireAccountWireHeader(WEB_AUTH_PROTOCOL_HEADER)]: webProtocol }
      : {}),
    ...(native
      ? {
          [requireAccountWireHeader(NATIVE_ACCOUNT_BETA_HEADER)]:
            NATIVE_ACCOUNT_BETA_HEADER_VALUE,
        }
      : {}),
  };
}

/** Detects the fixed native origin even while its Production latch is closed. */
function presentsNativeAppOrigin(request: Request): boolean {
  return request.headers.get("origin")?.trim().toLowerCase() === NATIVE_APP_ORIGIN;
}

/**
 * Creates an RLS client and verifies the caller's identity with Auth.
 *
 * Two bearer transports are decided before ANY client is constructed. The
 * reviewed native origin additionally requires its live latch and beta marker;
 * browser customers use an explicit bearer and never fall back to the legacy
 * cookie slot reserved for the operator console.
 */
export async function authenticatedServerContext(
  request: Request,
): Promise<AuthenticatedContext | Response> {
  const deletionCleanup = request.headers.get(
    ACCOUNT_DELETION_CLEANUP_HEADER,
  );
  if (
    deletionCleanup !== null &&
    deletionCleanup !== ACCOUNT_DELETION_CLEANUP_HEADER_VALUE
  ) {
    return privateError("forbidden", 403);
  }
  if (isNativeAppOrigin(request)) {
    if (request.headers.has(WEB_AUTH_PROTOCOL_HEADER)) {
      return privateError("forbidden", 403);
    }
    return nativeBearerContext(request);
  }
  // A disabled native caller must not be reclassified as an ordinary web
  // bearer merely because the live native-origin latch is currently false.
  if (presentsNativeAppOrigin(request)) return privateError("forbidden", 403);
  if (request.headers.has(NATIVE_ACCOUNT_BETA_HEADER)) {
    return privateError("forbidden", 403);
  }
  return webBearerContext(request);
}

/** Verifies an explicit customer-web bearer without consulting any cookie. */
async function webBearerContext(
  request: Request,
): Promise<AuthenticatedContext | Response> {
  if (
    request.headers.get(WEB_AUTH_PROTOCOL_HEADER) !==
    WEB_AUTH_PROTOCOL_VERSION
  ) {
    return privateError("forbidden", 403);
  }
  const expected = request.headers.get(EXPECTED_ACCOUNT_USER_HEADER);
  if (!expected || !UUID.test(expected)) return privateError("forbidden", 403);
  const token = parsedBearerToken(request.headers.get("authorization"));
  if (!token) return privateError("unauthorized", 401);
  try {
    const supabase = createBearerSupabase(
      token,
      databaseBoundaryHeaders(request, false),
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      if (isAuthRetryableFetchError(error)) {
        recordServerFailure("auth", "session", error);
      }
      return privateError("unauthorized", 401);
    }
    const boundary = expectedUserBoundary(request, user, true);
    if (boundary) return boundary;
    return { supabase, storageSupabase: supabase, user };
  } catch (error) {
    recordServerFailure("auth", "session", error);
    return privateError("unavailable", 503);
  }
}

/**
 * Verifies a native bearer token and returns the SAME client that carries it.
 *
 * The bearer client must BE `context.supabase`, not merely resolve a user id:
 * the avatar RPCs are `security definer` and read `auth.uid()` internally, so
 * a verify-only design passes 15 of 16 call sites and silently no-ops all
 * three avatar handlers. The 401 for a bad token matches the cookie failure
 * exactly, keeping a partial rollout indistinguishable from a logged-out user.
 * Both transports parse their bearer before client construction, so a missing
 * or malformed token stays 401 while a shaped token can report configuration
 * or dependency failure without ever consulting a cookie.
 */
async function nativeBearerContext(
  request: Request,
): Promise<AuthenticatedContext | Response> {
  const token = parsedBearerToken(request.headers.get("authorization"));
  if (!token) return privateError("unauthorized", 401);
  if (
    request.headers.get(NATIVE_ACCOUNT_BETA_HEADER) !==
    NATIVE_ACCOUNT_BETA_HEADER_VALUE
  ) {
    return privateError("forbidden", 403);
  }
  try {
    const supabase = createBearerSupabase(
      token,
      databaseBoundaryHeaders(request, true),
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      // A GoTrue outage is RETURNED as a retryable fetch error, not thrown.
      // The response stays the fail-closed 401, but the outage must not be
      // invisible: without this record, an Auth incident reads as a wave of
      // native token failures.
      if (isAuthRetryableFetchError(error)) {
        recordServerFailure("auth", "session", error);
      }
      return privateError("unauthorized", 401);
    }
    const boundary = expectedUserBoundary(request, user);
    if (boundary) return boundary;
    return { supabase, storageSupabase: supabase, user };
  } catch (error) {
    recordServerFailure("auth", "session", error);
    return privateError("unavailable", 503);
  }
}

/** Builds the per-request RLS client that carries the caller's own JWT. */
function createBearerSupabase(
  accessToken: string,
  boundaryHeaders: Record<string, string>,
): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — see docs/SETUP.md.",
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublishableKey()!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        // Rides every PostgREST AND Storage request, which is what lets
        // auth.uid() resolve inside the avatar RPCs. Capital A is
        // load-bearing: supabase-js spreads header objects case-sensitively
        // over its own Authorization default, so a lowercase key would send
        // both values and Auth rejects the pair.
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...boundaryHeaders,
        },
      },
    },
  );
}
