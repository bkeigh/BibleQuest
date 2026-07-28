import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
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

/**
 * Email OTP types we accept on the token_hash path. An allow-list, not a cast:
 * `type` arrives from the (attacker-influencable) query string, and passing an
 * unexpected value straight into verifyOtp is how you get surprises.
 */
const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "magiclink",
  "signup",
  "recovery",
  "invite",
  "email_change",
]);

function asEmailOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value as EmailOtpType)
    ? (value as EmailOtpType)
    : null;
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
 * Auth callback. Handles both flows Supabase can send us:
 *
 *  - `?code=…`  — the PKCE authorization-code flow, used by OAuth (Google) and
 *    by the default `{{ .ConfirmationURL }}` email template. Completing it
 *    needs the code-verifier cookie set in the browser that STARTED sign-in,
 *    so it only works when the link is opened in that same browser.
 *
 *  - `?token_hash=…&type=…` — the OTP-verification flow. It carries no verifier
 *    cookie, so it works no matter where the email link is opened (Mail's
 *    in-app webview, the system browser of an installed PWA, a second device).
 *    Switch the Supabase email templates to `{{ .TokenHash }}` to route magic
 *    links here; until then this branch is simply never taken.
 *
 * When account sync is available, either flow ends with a session cookie and
 * returns the user to the app. Guest-only containment rejects both first.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = asEmailOtpType(url.searchParams.get("type"));
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
  } else if (code || (tokenHash && type)) {
    try {
      const supabase = await createServerSupabase();
      const { data, error } = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });
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
