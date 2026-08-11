import "server-only";

import {
  createClient,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { parsedBearerToken } from "@/lib/http/bearer-token";
import { isNativeAppOrigin } from "@/lib/http/native-origin";
import { privateError } from "@/lib/http/request";
import { recordServerFailure } from "@/lib/observability/server-failures";
import { supabasePublishableKey } from "@/lib/supabase/config";
import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
} from "@/lib/sync/native-beta-headers";

type AuthenticatedContext = { supabase: SupabaseClient; user: User };
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Enforce an optional caller-captured owner before any account route runs. */
function expectedUserBoundary(request: Request, user: User): Response | null {
  const expected = request.headers.get(EXPECTED_ACCOUNT_USER_HEADER);
  if (expected === null) return null;
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
  return {
    ...(expected && UUID.test(expected)
      ? { [EXPECTED_ACCOUNT_USER_HEADER]: expected }
      : {}),
    ...(cleanup === ACCOUNT_DELETION_CLEANUP_HEADER_VALUE
      ? { [ACCOUNT_DELETION_CLEANUP_HEADER]: cleanup }
      : {}),
    ...(native
      ? { [NATIVE_ACCOUNT_BETA_HEADER]: NATIVE_ACCOUNT_BETA_HEADER_VALUE }
      : {}),
  };
}

/**
 * Creates an RLS client and verifies the caller's identity with Auth.
 *
 * Two transports, decided before ANY client is constructed: requests from the
 * reviewed native origin are bearer-only and never touch the cookie factory,
 * everything else keeps today's cookie session exactly. The native branch has
 * no fallthrough — a native-origin request with a missing, malformed or
 * invalid token is 401, never a cookie identity — because `getUser(jwt)`
 * falls back to the client's own session on a falsy token, so any path that
 * can reach both factories can silently act as the wrong caller.
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
  if (isNativeAppOrigin(request)) return nativeBearerContext(request);
  try {
    const supabase = await createServerSupabase(
      databaseBoundaryHeaders(request, false),
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return privateError("unauthorized", 401);
    const boundary = expectedUserBoundary(request, user);
    if (boundary) return boundary;
    return { supabase, user };
  } catch (error) {
    // Every authenticated route depends on this, so a missing Supabase
    // variable must not read as an ordinary transient outage.
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
 * (On an unconfigured deployment this branch answers 401 for a missing or
 * malformed header and 503 for a shaped one, where web answers 503 uniformly —
 * the parse gate deliberately precedes client construction.)
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
    return { supabase, user };
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
