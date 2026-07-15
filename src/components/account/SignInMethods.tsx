"use client";

/**
 * SignInMethods — the actual sign-in affordances (magic link, phone OTP,
 * Google), extracted from AccountScreen so the onboarding account step can
 * reuse them verbatim rather than duplicating auth logic. This is the single
 * place any of signInWithOtp / verifyOtp / signInWithOAuth is called.
 *
 * It renders ONLY the method controls and their transient states (link sent,
 * code entry). Surrounding chrome — page header, benefits copy, the signed-in
 * card, the callback-error banner — stays with whoever hosts it.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GentleButton } from "@/components/design-system/GentleButton";
import { track } from "@/lib/analytics/events";

type EmailStatus = "idle" | "sending" | "sent";
type PhoneStatus = "idle" | "sending" | "code-sent" | "verifying";

// E.164: a leading + and 7–15 digits (first digit non-zero).
const E164 = /^\+[1-9]\d{6,14}$/;
// Loose email shape check — the real validation is the link arriving.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const RESEND_COOLDOWN_SECONDS = 30;

interface SignInMethodsProps {
  /** Where these controls live — flows into analytics as the funnel source. */
  source: "account" | "onboarding";
  /**
   * Fired once the magic-link email is successfully sent. Onboarding uses it
   * to reveal an "Open BibleQuest" exit so the user isn't stranded on the
   * "check your email" panel (its flow has no other way forward from here).
   */
  onEmailSent?: () => void;
}

export function SignInMethods({ source, onEmailSent }: SignInMethodsProps) {
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>("idle");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tick the OTP resend cooldown down once a second.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const emailValid = EMAIL.test(email.trim());

  async function sendLink() {
    if (!EMAIL.test(email.trim())) return;
    setError(null);
    setEmailStatus("sending");
    track("sign_in_started", { method: "magic_link", source });
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("We couldn’t send the link. Please try again in a moment.");
      setEmailStatus("idle");
    } else {
      setEmailStatus("sent");
      onEmailSent?.();
    }
  }

  async function sendCode() {
    const p = phone.trim();
    if (!E164.test(p)) {
      setError("Enter your number with country code, like +15551234567.");
      return;
    }
    setError(null);
    setPhoneStatus("sending");
    track("sign_in_started", { method: "phone_otp", source });
    const { error } = await createClient().auth.signInWithOtp({ phone: p });
    if (error) {
      setError("We couldn’t send the code. Please check the number and retry.");
      setPhoneStatus("idle");
    } else {
      setPhoneStatus("code-sent");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }

  async function resendCode() {
    if (resendCooldown > 0 || resending) return;
    setError(null);
    setResending(true);
    const { error } = await createClient().auth.signInWithOtp({
      phone: phone.trim(),
    });
    setResending(false);
    if (error) {
      setError("We couldn’t send the code. Please try again in a moment.");
    } else {
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }

  async function verifyCode() {
    const token = code.trim();
    if (token.length < 4) return;
    setError(null);
    setPhoneStatus("verifying");
    const { error } = await createClient().auth.verifyOtp({
      phone: phone.trim(),
      token,
      type: "sms",
    });
    if (error) {
      setError("That code didn’t match. Please try again.");
      setPhoneStatus("code-sent");
    }
    // On success, onAuthStateChange updates the session and the host swaps to
    // its signed-in view automatically.
  }

  async function oauth(provider: "google") {
    setError(null);
    setOauthPending(true);
    track("sign_in_started", { method: "google", source });
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setOauthPending(false);
      setError("We couldn’t start sign-in. Please try again.");
    }
    // On success the browser navigates away; the pending state holds until then.
  }

  if (emailStatus === "sent") {
    return (
      <div>
        <div className="rounded-[var(--radius-card)] bg-accent-surface p-4 text-center">
          <p className="text-small leading-relaxed text-accent-ink">
            Check your email for a sign-in link. You can close this page.
          </p>
        </div>
        <GentleButton
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => setEmailStatus("idle")}
        >
          Use a different method
        </GentleButton>
      </div>
    );
  }

  if (phoneStatus === "code-sent" || phoneStatus === "verifying") {
    return (
      <div>
        <label
          htmlFor="signin-code"
          className="mb-1.5 block text-caption text-ash"
        >
          Enter the code sent to {phone.trim()}
        </label>
        <input
          id="signin-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className="w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-center text-[1.25rem] tracking-[0.3em] text-graphite outline-none focus:border-accent/50"
        />
        <GentleButton
          variant="primary"
          size="md"
          fullWidth
          className="mt-3"
          onClick={verifyCode}
          disabled={code.trim().length < 4 || phoneStatus === "verifying"}
        >
          {phoneStatus === "verifying" ? "Verifying…" : "Verify & sign in"}
        </GentleButton>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <GentleButton
            variant="ghost"
            size="sm"
            onClick={resendCode}
            disabled={resendCooldown > 0 || resending}
          >
            {resending
              ? "Sending…"
              : resendCooldown > 0
                ? `Resend code (${resendCooldown}s)`
                : "Resend code"}
          </GentleButton>
          <GentleButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setPhoneStatus("idle");
              setCode("");
              setError(null);
            }}
          >
            Use a different number
          </GentleButton>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-caption text-rose-700">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Email magic link */}
      <div>
        <label
          htmlFor="signin-email"
          className="mb-1.5 block text-caption text-ash"
        >
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-body text-graphite outline-none focus:border-accent/50"
        />
        <GentleButton
          variant="primary"
          size="md"
          fullWidth
          className="mt-3"
          onClick={sendLink}
          disabled={!emailValid || emailStatus === "sending"}
        >
          {emailStatus === "sending" ? "Sending…" : "Send a sign-in link"}
        </GentleButton>
      </div>

      <Divider />

      {/* Phone OTP */}
      <div>
        <label
          htmlFor="signin-phone"
          className="mb-1.5 block text-caption text-ash"
        >
          Phone
        </label>
        <input
          id="signin-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+15551234567"
          className="w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-body text-graphite outline-none focus:border-accent/50"
        />
        <GentleButton
          variant="outline"
          size="md"
          fullWidth
          className="mt-3"
          onClick={sendCode}
          disabled={!phone.trim() || phoneStatus === "sending"}
        >
          {phoneStatus === "sending" ? "Sending…" : "Text me a code"}
        </GentleButton>
      </div>

      <Divider />

      <GentleButton
        variant="outline"
        size="md"
        fullWidth
        onClick={() => oauth("google")}
        disabled={oauthPending}
      >
        {oauthPending ? "Opening Google…" : "Continue with Google"}
      </GentleButton>

      {error && (
        <p role="alert" className="mt-3 text-caption text-rose-700">
          {error}
        </p>
      )}
    </>
  );
}

function Divider() {
  return (
    <div className="my-3.5 flex items-center gap-3 text-caption text-ash">
      <span className="h-px flex-1 bg-mist" />
      or
      <span className="h-px flex-1 bg-mist" />
    </div>
  );
}
