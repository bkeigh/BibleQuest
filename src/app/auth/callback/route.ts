import { NextResponse } from "next/server";
import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";
import {
  authFailureReason,
  type AuthFailureReason,
} from "@/lib/auth/errors";
import { AUTH_COMPLETION_COOKIE } from "@/lib/auth/completion-signal";
import { accountSyncAvailable } from "@/lib/sync/containment";
import { isConsoleRequestHost } from "@/lib/console/paths";
import {
  consoleAllowedEmails,
  consoleAuthEnabled,
} from "@/lib/console/auth-config";

const MAX_AUTHORIZATION_CODE_LENGTH = 4_096;

/** Accepts one bounded opaque provider code without retaining it server-side. */
function safeAuthorizationCode(value: string | null): value is string {
  return Boolean(
    value &&
      value.length <= MAX_AUTHORIZATION_CODE_LENGTH &&
      /^[\x21-\x7e]+$/.test(value),
  );
}

/** Moves a customer code into a fragment that is never sent with the next request. */
function customerCompletionRedirect(url: URL, code: string, next: string) {
  const destination = new URL("/auth/customer-callback", url.origin);
  destination.hash = new URLSearchParams({ code, next }).toString();
  return privateRedirect(destination);
}

/** Allows the independent operator console to complete auth while product sync stays contained. */
function isConfiguredConsoleCallback(
  request: Request,
  url: URL,
  next: string,
): boolean {
  const consoleTarget =
    isConsoleRequestHost(
      url.host,
      request.headers.get("x-forwarded-host"),
    ) || next === "/console";

  return (
    consoleTarget &&
    consoleAuthEnabled() &&
    consoleAllowedEmails().size > 0
  );
}

/**
 * Completes only Supabase's browser-bound PKCE authorization-code flow. Email
 * authentication stays code-only inside the browser or installed app that
 * requested it; accepting a bearer token_hash here would let an unsolicited
 * link replace another browser's session and expose its local guest journey.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const providerError =
    url.searchParams.get("error_code") ?? url.searchParams.get("error");
  const consoleCallback = isConfiguredConsoleCallback(request, url, next);
  let failure: AuthFailureReason = "unknown";

  // Customer auth stays fail-closed during containment. The independently
  // configured operator console can still exchange its own callback.
  if (
    !accountSyncAvailable(isSupabaseConfigured()) &&
    !consoleCallback
  ) {
    failure = "configuration";
  } else if (providerError) {
    failure = authFailureReason(null, providerError);
  } else if (safeAuthorizationCode(code)) {
    if (!consoleCallback) {
      // Customer PKCE completion is browser-only. The server may route the
      // opaque code, but it never exchanges it or writes customer credentials.
      return customerCompletionRedirect(url, code, next);
    }
    try {
      const supabase = await createServerSupabase();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const email = data.user?.email?.trim().toLowerCase();
        if (!consoleCallback || (email && consoleAllowedEmails().has(email))) {
          return privateRedirect(new URL(next, url.origin), true);
        }

        // A valid Supabase account is not automatically a console operator.
        // Remove its local session before returning a generic sign-in failure.
        await supabase.auth.signOut({ scope: "local" });
        failure = "invalid";
      } else {
        failure = authFailureReason(error);
      }
    } catch (error) {
      failure = authFailureReason(error);
    }
  } else {
    // A token hash with a missing/unapproved type, a stripped callback, or a
    // direct visit cannot be verified. Keep that distinct from an expiry.
    failure = "invalid";
  }

  // A failed returning-user sign-in must stay on the public onboarding route;
  // sending a fresh device to /app/account would put it behind the very gate
  // that is waiting for account restoration. Other account invitations keep
  // the established in-app recovery screen.
  if (consoleCallback) {
    const consoleSignInPath = isConsoleRequestHost(
      url.host,
      request.headers.get("x-forwarded-host"),
    )
      ? "/sign-in"
      : "/console/sign-in";
    return privateRedirect(new URL(consoleSignInPath, url.origin));
  }

  const errorUrl = new URL(
    new URL(next, url.origin).pathname === "/onboarding"
      ? "/onboarding"
      : "/app/account",
    url.origin,
  );
  errorUrl.searchParams.set("error", failure);
  return privateRedirect(errorUrl);
}

function privateRedirect(url: URL, authCompleted = false) {
  const response = NextResponse.redirect(url);
  if (authCompleted) {
    response.cookies.set(AUTH_COMPLETION_COOKIE, "1", {
      httpOnly: false,
      maxAge: 5 * 60,
      path: "/",
      sameSite: "lax",
      secure: url.protocol === "https:",
    });
  }
  // Auth URLs and their error reasons should never enter an intermediary or
  // service-worker cache, including failure paths that set no session cookie.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
