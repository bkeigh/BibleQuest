import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  createServerSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/redirect";

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
 * Either way we end with a session cookie, then return the user to the app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = asEmailOtpType(url.searchParams.get("type"));
  const next = safeNextPath(url.searchParams.get("next"));

  if (isSupabaseConfigured() && (code || (tokenHash && type))) {
    const supabase = await createServerSupabase();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  // A failed returning-user sign-in must stay on the public onboarding route;
  // sending a fresh device to /app/account would put it behind the very gate
  // that is waiting for account restoration. Other account invitations keep
  // the established in-app recovery screen.
  const errorPath = new URL(next, url.origin).pathname === "/onboarding"
    ? "/onboarding?error=signin"
    : "/app/account?error=signin";
  return NextResponse.redirect(new URL(errorPath, url.origin));
}
