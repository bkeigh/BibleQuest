"use client";

/**
 * Shared passwordless sign-in controls. A successful OTP request only means
 * Supabase accepted the request; provider-side SMTP still determines whether
 * the message reaches the inbox, so the requested state explains recovery and
 * offers a rate-limit-aware resend.
 */
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GentleButton } from "@/components/design-system/GentleButton";
import { track } from "@/lib/analytics/events";
import {
  classifyOperationalError,
  reportClientSignal,
} from "@/lib/observability/client-signals";
import { resolveAuthCallbackUrl } from "@/lib/platform/auth";
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
import { isNativeTarget } from "@/lib/platform/target";
import { requireNativeAccountBetaAvailability } from "@/lib/sync/availability";
import { requireAccountLifecycleIdle } from "@/lib/auth/account-lifecycle";
import {
  beginEmailOtpAttempt,
  cancelEmailOtpAttempt,
  emailOtpAttemptIsCurrent,
  emailOtpInstallationNeedsReload,
  requestIsolatedEmailOtp,
  verifyAndInstallEmailOtp,
  type EmailOtpAttempt,
} from "@/lib/auth/email-otp-verification";
import {
  readWebAuthState,
  requireCurrentWebAccountRealm,
  withWebAccountOperationLock,
} from "@/lib/supabase/web-auth-storage";

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
  /** Fired once an email code has installed a verified session. */
  onSignedIn?: () => void;
  /** Safe same-origin destination after the auth callback completes. */
  nextPath?: string;
}

export function SignInMethods({
  source,
  intent = "signin",
  onEmailSent,
  onUnavailable,
  onSignedIn,
  nextPath = "/app",
}: SignInMethodsProps) {
  const nativeTarget = isNativeTarget();
  const [email, setEmail] = useState("");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailOtp, setEmailOtp] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<AuthRequestFailure | null>(null);
  const activeOtpAttempt = useRef<EmailOtpAttempt | null>(null);
  const requestedEmailRef = useRef("");
  const verificationInFlight = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(
    () => () => {
      // A verification already in flight owns its attempt; unmounting this form
      // must not cancel it. Installing the session flips `useSession().loading`,
      // which swaps this form off screen mid-verify. Cancelling here bumped the
      // attempt generation and blanked the requested address, so the installer
      // saw its own success as "the user changed their mind" and deleted the
      // credential it had just written — sign-in silently did nothing.
      if (verificationInFlight.current) return;
      cancelEmailOtpAttempt(activeOtpAttempt.current);
      activeOtpAttempt.current = null;
      requestedEmailRef.current = "";
    },
    [],
  );

  const emailValid = EMAIL.test(email.trim());
  const online = () =>
    typeof navigator === "undefined" || navigator.onLine !== false;

  function callbackUrl() {
    return resolveAuthCallbackUrl(nextPath);
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
      const lifecycle = requireAccountLifecycleIdle();
      await requireNativeAccountBetaAvailability();
      requireAccountLifecycleIdle(lifecycle);
      const { error: requestError } = await withDeadline(
        requestIsolatedEmailOtp(address, shouldCreateAccount(intent)),
        AUTH_REQUEST_DEADLINE_MS,
        "Email sign-in request",
      );
      requireAccountLifecycleIdle(lifecycle);
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

      cancelEmailOtpAttempt(activeOtpAttempt.current);
      activeOtpAttempt.current = null;
      requestedEmailRef.current = address;
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

  /** Verifies off-storage, then installs only the still-current email session. */
  async function verifyEmailCode(submittedCode = emailOtp) {
    const code = normalizeEmailOtp(submittedCode);
    if (!isEmailOtpReady(code) || verifyingOtp || activeOtpAttempt.current) {
      return;
    }

    setError(null);
    setVerifyingOtp(true);
    let attempt: EmailOtpAttempt | null = null;
    try {
      const lifecycle = requireAccountLifecycleIdle();
      await requireNativeAccountBetaAvailability();
      requireAccountLifecycleIdle(lifecycle);
      attempt = beginEmailOtpAttempt(requestedEmailRef.current);
      activeOtpAttempt.current = attempt;
      verificationInFlight.current = true;
      const result = await verifyAndInstallEmailOtp(
        attempt,
        code,
        () => requestedEmailRef.current,
      );
      if (result.status === "stale") return;
      if (result.status === "error") {
        if (emailOtpInstallationNeedsReload(result.error)) {
          window.location.reload();
          return;
        }
        reportClientSignal({
          surface: "auth",
          stage: "verify_email",
          outcome: "failure",
          category: classifyOperationalError(result.error, online()),
        });
        showFailure(emailOtpFailure(result.error, online()));
        return;
      }

      reportClientSignal({
        surface: "auth",
        stage: "verify_email",
        outcome: "success",
        category: "ok",
      });
      setEmailOtp("");
      onSignedIn?.();
      // Supabase emits SIGNED_IN in this same PWA context. The shared session
      // hook verifies the user and advances the existing account flow.
    } catch (verificationError) {
      if (emailOtpInstallationNeedsReload(verificationError)) {
        window.location.reload();
        return;
      }
      if (
        attempt &&
        !emailOtpAttemptIsCurrent(attempt, requestedEmailRef.current)
      ) {
        return;
      }
      reportClientSignal({
        surface: "auth",
        stage: "verify_email",
        outcome: "failure",
        category: classifyOperationalError(verificationError, online()),
      });
      showFailure(emailOtpFailure(verificationError, online()));
    } finally {
      verificationInFlight.current = false;
      if (!attempt || activeOtpAttempt.current === attempt) {
        cancelEmailOtpAttempt(attempt);
        activeOtpAttempt.current = null;
        setVerifyingOtp(false);
      }
    }
  }

  async function oauth(provider: OAuthProvider) {
    const providerName = provider === "apple" ? "Apple" : "Google";
    setError(null);
    setOauthPending(provider);
    track("sign_in_started", { method: provider, source });
    try {
      const lifecycle = requireAccountLifecycleIdle();
      const request = () =>
        createClient().auth.signInWithOAuth({
          provider,
          options: { redirectTo: callbackUrl() },
        });
      const guardedRequest = nativeTarget
        ? request()
        : withWebAccountOperationLock(async (handle) => {
            await requireCurrentWebAccountRealm(handle);
            const state = await readWebAuthState(handle);
            if (state.status !== "missing") {
              throw new Error("Account sign-in is unavailable.");
            }
            return request();
          });
      const { error: requestError } = await withDeadline(
        guardedRequest,
        AUTH_REQUEST_DEADLINE_MS,
        `${providerName} sign-in request`,
      );
      requireAccountLifecycleIdle(lifecycle);
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
            “BibleQuest.” The code can only be used once.
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
              const next = normalizeEmailOtp(event.target.value);
              setEmailOtp(next);
              setError(null);
              // A paste or an iOS one-time-code autofill arrives as a whole
              // code in a single change, so submit it instead of asking for a
              // tap the person has already effectively made. Typing advances
              // one digit at a time and still lands on the button, which keeps
              // longer local-Supabase codes from submitting at six digits.
              if (
                next.length - emailOtp.length > 1 &&
                isEmailOtpReady(next) &&
                !verifyingOtp &&
                !resending
              ) {
                void verifyEmailCode(next);
              }
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
              cancelEmailOtpAttempt(activeOtpAttempt.current);
              activeOtpAttempt.current = null;
              requestedEmailRef.current = "";
              setEmailStatus("idle");
              setEmailOtp("");
              setError(null);
            }}
          >
            Change email
          </GentleButton>
        </div>

        {!nativeTarget && (
          <>
            <Divider />
            <OAuthButtons
              pending={oauthPending}
              disabled={Boolean(oauthPending) || resending || verifyingOtp}
              onSelect={oauth}
            />
          </>
        )}
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

      {!nativeTarget && (
        <>
          <Divider />
          <OAuthButtons
            pending={oauthPending}
            disabled={Boolean(oauthPending) || emailStatus === "sending"}
            onSelect={oauth}
          />
        </>
      )}

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

/** Renders the supplied Apple silhouette converted to white for contrast. */
function AppleMark() {
  return (
    <span
      aria-hidden="true"
      data-provider-mark="apple"
      className="h-5 w-5 shrink-0 bg-contain bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/brand/apple-logo-white.png')" }}
    />
  );
}

/** Renders the supplied 2025 Google G without altering its colors. */
function GoogleMark() {
  return (
    <span
      aria-hidden="true"
      data-provider-mark="google"
      className="h-6 w-6 shrink-0 bg-contain bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/brand/google-g-2025.png')" }}
    />
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
