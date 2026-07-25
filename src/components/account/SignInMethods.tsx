"use client";

/**
 * Shared passwordless sign-in controls. A successful OTP request only means
 * Supabase accepted the request; provider-side SMTP still determines whether
 * the message reaches the inbox, so the requested state explains recovery and
 * offers a rate-limit-aware resend.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GentleButton } from "@/components/design-system/GentleButton";
import { track } from "@/lib/analytics/events";
import {
  classifyOperationalError,
  reportClientSignal,
} from "@/lib/observability/client-signals";
import { authCallbackPath } from "@/lib/auth/redirect";
import {
  emailOtpFailure,
  emailRequestFailure,
  oauthRequestFailure,
  type AuthRequestFailure,
} from "@/lib/auth/errors";
import {
  ACCOUNT_SYNC_CONTAINED,
  ACCOUNT_SYNC_CONTAINMENT_NOTICE,
} from "@/lib/sync/containment";
import { withDeadline } from "@/lib/async/deadline";

type EmailStatus = "idle" | "sending" | "requested";

// A quick client-side affordance. Supabase remains the source of truth.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_OTP = /^\d{6,8}$/;
/** Supabase's default per-address passwordless-email window is 60 seconds. */
const RESEND_COOLDOWN_SECONDS = 60;
const AUTH_REQUEST_DEADLINE_MS = 12_000;

/** Only explicit enrollment may let Supabase create a new email identity. */
export function shouldCreateAccount(intent: "create" | "signin"): boolean {
  return intent === "create";
}

/** Keeps pasted email codes numeric and within Supabase's supported range. */
export function normalizeEmailOtp(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

/** Accepts current hosted and local Supabase email-code lengths. */
export function isEmailOtpReady(value: string): boolean {
  return EMAIL_OTP.test(value);
}

interface SignInMethodsProps {
  source: "account" | "onboarding";
  /** Changes account creation copy and prevents email signup in returning-user mode. */
  intent?: "create" | "signin";
  /** Fired after Supabase accepts an email request (not a delivery claim). */
  onEmailSent?: () => void;
  /** Lets onboarding expose its local fallback after auth is unavailable. */
  onUnavailable?: () => void;
  /** Safe same-origin destination after the auth callback completes. */
  nextPath?: string;
}

export function SignInMethods({
  source,
  intent = "signin",
  onEmailSent,
  onUnavailable,
  nextPath = "/app",
}: SignInMethodsProps) {
  const [email, setEmail] = useState("");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailOtp, setEmailOtp] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState<AuthRequestFailure | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const emailValid = EMAIL.test(email.trim());
  const online = () =>
    typeof navigator === "undefined" || navigator.onLine !== false;

  function callbackUrl() {
    return new URL(authCallbackPath(nextPath), window.location.origin).toString();
  }

  function showFailure(failure: AuthRequestFailure) {
    setError(failure);
    if (failure.unavailable) onUnavailable?.();
  }

  async function requestLink(resend = false) {
    const address = email.trim();
    if (!EMAIL.test(address) || (resend && resendCooldown > 0)) return;

    setError(null);
    if (resend) setResending(true);
    else {
      setEmailStatus("sending");
      track("sign_in_started", { method: "magic_link", source });
    }

    try {
      const { error: requestError } = await withDeadline(
        createClient().auth.signInWithOtp({
          email: address,
          options: {
            emailRedirectTo: callbackUrl(),
            shouldCreateUser: shouldCreateAccount(intent),
          },
        }),
        AUTH_REQUEST_DEADLINE_MS,
        "Email sign-in request",
      );
      if (requestError) {
        reportClientSignal({
          surface: "auth",
          stage: "request_email",
          outcome: "failure",
          category: classifyOperationalError(requestError, online()),
        });
        showFailure(emailRequestFailure(requestError, online()));
        if (!resend) setEmailStatus("idle");
        return;
      }

      setRequestedEmail(address);
      setEmailOtp("");
      setEmailStatus("requested");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      reportClientSignal({
        surface: "auth",
        stage: "request_email",
        outcome: "success",
        category: "ok",
      });
      onEmailSent?.();
    } catch (requestError) {
      reportClientSignal({
        surface: "auth",
        stage: "request_email",
        outcome: "failure",
        category: classifyOperationalError(requestError, online()),
      });
      showFailure(emailRequestFailure(requestError, online()));
      if (!resend) setEmailStatus("idle");
    } finally {
      if (resend) setResending(false);
    }
  }

  /** Completes auth in the current storage context, including an installed PWA. */
  async function verifyEmailCode() {
    if (!isEmailOtpReady(emailOtp) || verifyingOtp) return;

    setError(null);
    setVerifyingOtp(true);
    try {
      const { error: verificationError } = await withDeadline(
        createClient().auth.verifyOtp({
          email: requestedEmail,
          token: emailOtp,
          type: "email",
        }),
        AUTH_REQUEST_DEADLINE_MS,
        "Email-code verification",
      );
      if (verificationError) {
        reportClientSignal({
          surface: "auth",
          stage: "verify_email",
          outcome: "failure",
          category: classifyOperationalError(verificationError, online()),
        });
        showFailure(emailOtpFailure(verificationError, online()));
        return;
      }

      reportClientSignal({
        surface: "auth",
        stage: "verify_email",
        outcome: "success",
        category: "ok",
      });
      setEmailOtp("");
      // Supabase emits SIGNED_IN in this same PWA context. The shared session
      // hook verifies the user and advances the existing account flow.
    } catch (verificationError) {
      reportClientSignal({
        surface: "auth",
        stage: "verify_email",
        outcome: "failure",
        category: classifyOperationalError(verificationError, online()),
      });
      showFailure(emailOtpFailure(verificationError, online()));
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function oauth(provider: "google") {
    setError(null);
    setOauthPending(true);
    track("sign_in_started", { method: "google", source });
    try {
      const { error: requestError } = await withDeadline(
        createClient().auth.signInWithOAuth({
          provider,
          options: { redirectTo: callbackUrl() },
        }),
        AUTH_REQUEST_DEADLINE_MS,
        "Google sign-in request",
      );
      if (requestError) {
        reportClientSignal({
          surface: "auth",
          stage: "request_oauth",
          outcome: "failure",
          category: classifyOperationalError(requestError, online()),
        });
        setOauthPending(false);
        showFailure(oauthRequestFailure(requestError, online()));
      }
      // On success the browser navigates away; pending intentionally remains.
    } catch (requestError) {
      reportClientSignal({
        surface: "auth",
        stage: "request_oauth",
        outcome: "failure",
        category: classifyOperationalError(requestError, online()),
      });
      setOauthPending(false);
      showFailure(oauthRequestFailure(requestError, online()));
    }
  }

  // Defense in depth for any enrollment surface missed by a parent gate.
  if (ACCOUNT_SYNC_CONTAINED) {
    return (
      <p role="status" className="text-small leading-relaxed text-ash">
        {ACCOUNT_SYNC_CONTAINMENT_NOTICE}
      </p>
    );
  }

  if (emailStatus === "requested") {
    return (
      <div>
        <div
          role="status"
          aria-live="polite"
          className="rounded-[var(--radius-card)] bg-accent-surface p-4"
        >
          <p className="text-center text-small font-medium text-accent-ink">
            Check your email
          </p>
          <p className="mt-1 break-all text-center text-caption text-accent-ink">
            We requested a secure sign-in email for {requestedEmail}.
          </p>
          <p className="mt-2 text-center text-caption leading-relaxed text-ash">
            Delivery can take a minute. Check Spam or Junk, and search for
            “BibleQuest.” The code and link can only be used once.
          </p>
        </div>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void verifyEmailCode();
          }}
        >
          <label
            htmlFor="signin-email-code"
            className="mb-1.5 block text-caption text-ash"
          >
            Sign-in code
          </label>
          <input
            id="signin-email-code"
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            value={emailOtp}
            onChange={(event) => {
              setEmailOtp(normalizeEmailOtp(event.target.value));
              setError(null);
            }}
            placeholder="Enter the code"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "signin-error" : "pwa-code-help"}
            className="w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-center font-mono text-[1.25rem] tracking-[0.22em] text-graphite outline-none focus:border-accent/50"
          />
          <p
            id="pwa-code-help"
            className="mt-2 text-center text-caption leading-relaxed text-ash"
          >
            Using the Home Screen app? Stay here and enter the code instead of
            opening the email link in Safari.
          </p>
          <GentleButton
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            className="mt-3"
            disabled={!isEmailOtpReady(emailOtp) || verifyingOtp || resending}
            aria-busy={verifyingOtp}
          >
            {verifyingOtp ? "Signing in…" : "Sign in with code"}
          </GentleButton>
        </form>

        {error && <FailureNotice failure={error} />}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <GentleButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void requestLink(true)}
            disabled={resendCooldown > 0 || resending || verifyingOtp}
          >
            {resending
              ? "Requesting…"
              : resendCooldown > 0
                ? `Request another email (${resendCooldown}s)`
                : "Request another email"}
          </GentleButton>
          <GentleButton
            type="button"
            variant="ghost"
            size="sm"
            disabled={verifyingOtp}
            onClick={() => {
              setEmailStatus("idle");
              setEmailOtp("");
              setError(null);
            }}
          >
            Change email
          </GentleButton>
        </div>

        <Divider />

        <GentleButton
          type="button"
          variant="outline"
          size="md"
          fullWidth
          onClick={() => void oauth("google")}
          disabled={oauthPending || resending || verifyingOtp}
          aria-busy={oauthPending}
        >
          {oauthPending ? "Opening Google…" : "Continue with Google instead"}
        </GentleButton>
      </div>
    );
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void requestLink();
        }}
      >
        <label
          htmlFor="signin-email"
          className="mb-1.5 block text-caption text-ash"
        >
          Email
        </label>
        <input
          id="signin-email"
          type="email"
          enterKeyHint="send"
          autoComplete="email"
          spellCheck={false}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          placeholder="you@example.com"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "signin-error" : undefined}
          className="w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-body text-graphite outline-none focus:border-accent/50"
        />
        <GentleButton
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          className="mt-3"
          disabled={!emailValid || emailStatus === "sending" || oauthPending}
          aria-busy={emailStatus === "sending"}
        >
          {emailStatus === "sending"
            ? "Requesting…"
            : intent === "create"
              ? "Create account with email"
              : "Email me a sign-in code"}
        </GentleButton>
      </form>

      <Divider />

      <GentleButton
        type="button"
        variant="outline"
        size="md"
        fullWidth
        onClick={() => void oauth("google")}
        disabled={oauthPending || emailStatus === "sending"}
        aria-busy={oauthPending}
      >
        {oauthPending
          ? "Opening Google…"
          : intent === "create"
            ? "Create account with Google"
            : "Continue with Google"}
      </GentleButton>

      {error && <FailureNotice failure={error} />}
    </>
  );
}

function FailureNotice({ failure }: { failure: AuthRequestFailure }) {
  return (
    <div
      id="signin-error"
      role="alert"
      className="mt-3 rounded-[var(--radius-button)] border border-rose-300 px-3 py-2.5"
    >
      <p className="text-caption leading-relaxed text-rose-700">
        {failure.message}
      </p>
      <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.08em] text-ash">
        Reference: {failure.reference}
      </p>
    </div>
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
