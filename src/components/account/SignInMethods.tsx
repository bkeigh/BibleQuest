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
import { authCallbackPath } from "@/lib/auth/redirect";
import {
  emailRequestFailure,
  oauthRequestFailure,
  type AuthRequestFailure,
} from "@/lib/auth/errors";

type EmailStatus = "idle" | "sending" | "requested";

// A quick client-side affordance. Supabase remains the source of truth.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Supabase's default per-address magic-link window is 60 seconds. */
const RESEND_COOLDOWN_SECONDS = 60;

interface SignInMethodsProps {
  source: "account" | "onboarding";
  /** Fired after Supabase accepts a magic-link request (not a delivery claim). */
  onEmailSent?: () => void;
  /** Lets onboarding expose its local fallback after auth is unavailable. */
  onUnavailable?: () => void;
  /** Safe same-origin destination after the auth callback completes. */
  nextPath?: string;
}

export function SignInMethods({
  source,
  onEmailSent,
  onUnavailable,
  nextPath = "/app",
}: SignInMethodsProps) {
  const [email, setEmail] = useState("");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
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
      const { error: requestError } = await createClient().auth.signInWithOtp({
        email: address,
        options: {
          emailRedirectTo: callbackUrl(),
          shouldCreateUser: true,
        },
      });
      if (requestError) {
        showFailure(emailRequestFailure(requestError, online()));
        if (!resend) setEmailStatus("idle");
        return;
      }

      setRequestedEmail(address);
      setEmailStatus("requested");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      onEmailSent?.();
    } catch (requestError) {
      showFailure(emailRequestFailure(requestError, online()));
      if (!resend) setEmailStatus("idle");
    } finally {
      if (resend) setResending(false);
    }
  }

  async function oauth(provider: "google") {
    setError(null);
    setOauthPending(true);
    track("sign_in_started", { method: "google", source });
    try {
      const { error: requestError } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl() },
      });
      if (requestError) {
        setOauthPending(false);
        showFailure(oauthRequestFailure(requestError, online()));
      }
      // On success the browser navigates away; pending intentionally remains.
    } catch (requestError) {
      setOauthPending(false);
      showFailure(oauthRequestFailure(requestError, online()));
    }
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
            We requested a sign-in link for {requestedEmail}.
          </p>
          <p className="mt-2 text-center text-caption leading-relaxed text-ash">
            Delivery can take a minute. Check Spam or Junk, and search for
            “BibleQuest.” The link can only be used once.
          </p>
        </div>

        {error && <FailureNotice failure={error} />}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <GentleButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void requestLink(true)}
            disabled={resendCooldown > 0 || resending}
          >
            {resending
              ? "Requesting…"
              : resendCooldown > 0
                ? `Request another (${resendCooldown}s)`
                : "Request another link"}
          </GentleButton>
          <GentleButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setEmailStatus("idle");
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
          disabled={oauthPending || resending}
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
            : "Email me a sign-in link"}
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
        {oauthPending ? "Opening Google…" : "Continue with Google"}
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
