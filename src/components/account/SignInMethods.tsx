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
type OAuthProvider = "apple" | "google";

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
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
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

  async function oauth(provider: OAuthProvider) {
    const providerName = provider === "apple" ? "Apple" : "Google";
    setError(null);
    setOauthPending(provider);
    track("sign_in_started", { method: provider, source });
    try {
      const { error: requestError } = await withDeadline(
        createClient().auth.signInWithOAuth({
          provider,
          options: { redirectTo: callbackUrl() },
        }),
        AUTH_REQUEST_DEADLINE_MS,
        `${providerName} sign-in request`,
      );
      if (requestError) {
        reportClientSignal({
          surface: "auth",
          stage: "request_oauth",
          outcome: "failure",
          category: classifyOperationalError(requestError, online()),
        });
        setOauthPending(null);
        showFailure(oauthRequestFailure(requestError, provider, online()));
      }
      // On success the browser navigates away; pending intentionally remains.
    } catch (requestError) {
      reportClientSignal({
        surface: "auth",
        stage: "request_oauth",
        outcome: "failure",
        category: classifyOperationalError(requestError, online()),
      });
      setOauthPending(null);
      showFailure(oauthRequestFailure(requestError, provider, online()));
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

        <OAuthButtons
          pending={oauthPending}
          disabled={Boolean(oauthPending) || resending || verifyingOtp}
          onSelect={oauth}
        />
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
          disabled={
            !emailValid || emailStatus === "sending" || Boolean(oauthPending)
          }
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

      <OAuthButtons
        pending={oauthPending}
        disabled={Boolean(oauthPending) || emailStatus === "sending"}
        onSelect={oauth}
      />

      {error && <FailureNotice failure={error} />}
    </>
  );
}

/** Keeps Apple and Google behavior aligned across both email states. */
function OAuthButtons({
  pending,
  disabled,
  onSelect,
}: {
  pending: OAuthProvider | null;
  disabled: boolean;
  onSelect: (provider: OAuthProvider) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {(["apple", "google"] as const).map((provider) => {
        const providerName = provider === "apple" ? "Apple" : "Google";
        const label =
          pending === provider
            ? `Opening ${providerName}…`
            : `Sign in with ${providerName}`;

        return (
          <GentleButton
            key={provider}
            type="button"
            variant={provider}
            size="md"
            fullWidth
            className="gap-2.5"
            onClick={() => void onSelect(provider)}
            disabled={disabled}
            aria-label={label}
            aria-busy={pending === provider}
            data-provider-button={provider}
          >
            <span>{pending === provider ? "Opening" : "Sign in with"}</span>
            {provider === "apple" ? <AppleMark /> : <GoogleMark />}
          </GentleButton>
        );
      })}
    </div>
  );
}

/** Uses Apple's official silhouette as a compact white provider mark. */
function AppleMark() {
  return (
    <svg
      aria-hidden="true"
      data-provider-mark="apple"
      viewBox="0 0 16 16"
      className="h-5 w-5 shrink-0 fill-current"
    >
      <path d="M11.182.008c-.034-.038-1.259.015-2.452 1.24-1.069 1.097-1.803 2.455-1.628 3.775 1.317.102 2.66-.596 3.47-1.596.8-.987 1.31-2.376.61-3.419Z" />
      <path d="M14.651 8.946c-.015-2.039 1.667-3.018 1.742-3.063-.954-1.389-2.436-1.58-2.955-1.595-1.243-.131-2.45.744-3.083.744-.646 0-1.622-.731-2.672-.709-1.35.021-2.613.803-3.306 2.014-1.432 2.48-.364 6.126 1.008 8.13.686.981 1.487 2.072 2.536 2.033 1.026-.043 1.409-.653 2.648-.653 1.228 0 1.589.653 2.658.629 1.101-.018 1.794-.984 2.456-1.974.793-1.125 1.112-2.23 1.125-2.287-.026-.009-2.135-.814-2.157-3.269Z" />
    </svg>
  );
}

/** Keeps Google's standard multicolor G isolated on its required white field. */
function GoogleMark() {
  return (
    <span
      aria-hidden="true"
      data-provider-mark="google"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]">
        <path
          fill="#4285F4"
          d="M21.35 12.18c0-.74-.07-1.45-.19-2.14H12v4.05h5.24a4.48 4.48 0 0 1-1.94 2.94v2.62h3.14c1.84-1.69 2.91-4.18 2.91-7.47Z"
        />
        <path
          fill="#34A853"
          d="M12 21.7c2.62 0 4.82-.87 6.43-2.35l-3.14-2.62c-.87.58-1.98.93-3.29.93-2.53 0-4.67-1.71-5.44-4.01H3.32v2.7A9.7 9.7 0 0 0 12 21.7Z"
        />
        <path
          fill="#FBBC05"
          d="M6.56 13.65A5.83 5.83 0 0 1 6.25 12c0-.57.1-1.13.31-1.65v-2.7H3.32A9.7 9.7 0 0 0 2.3 12c0 1.56.37 3.04 1.02 4.35l3.24-2.7Z"
        />
        <path
          fill="#EA4335"
          d="M12 6.34c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.35 9.35 0 0 0 12 2.3a9.7 9.7 0 0 0-8.68 5.35l3.24 2.7C7.33 8.05 9.47 6.34 12 6.34Z"
        />
      </svg>
    </span>
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
