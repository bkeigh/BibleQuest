"use client";

/**
 * SignInMethods — the actual sign-in affordances (magic link and Google),
 * extracted from AccountScreen so the onboarding account step can reuse them
 * verbatim rather than duplicating auth logic. This is the single place any
 * signInWithOtp / signInWithOAuth call is made.
 *
 * It renders ONLY the method controls and their transient states. Surrounding
 * chrome — page header, benefits copy, the signed-in card, the callback-error
 * banner — stays with whoever hosts it.
 */
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GentleButton } from "@/components/design-system/GentleButton";
import { track } from "@/lib/analytics/events";
import { authCallbackPath } from "@/lib/auth/redirect";

type EmailStatus = "idle" | "sending" | "sent";

// Loose email shape check — the real validation is the link arriving.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface SignInMethodsProps {
  /** Where these controls live — flows into analytics as the funnel source. */
  source: "account" | "onboarding";
  /**
   * Fired once the magic-link email is successfully sent. Onboarding uses it
   * to reveal an "Open BibleQuest" exit so the user isn't stranded on the
   * "check your email" panel (its flow has no other way forward from here).
   */
  onEmailSent?: () => void;
  /** Safe same-origin destination after the auth callback completes. */
  nextPath?: string;
}

export function SignInMethods({
  source,
  onEmailSent,
  nextPath = "/app",
}: SignInMethodsProps) {
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL.test(email.trim());

  function callbackUrl() {
    return new URL(
      authCallbackPath(nextPath),
      window.location.origin
    ).toString();
  }

  async function sendLink() {
    if (!EMAIL.test(email.trim())) return;
    setError(null);
    setEmailStatus("sending");
    track("sign_in_started", { method: "magic_link", source });
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    if (error) {
      setError("We couldn’t send the link. Please try again in a moment.");
      setEmailStatus("idle");
    } else {
      setEmailStatus("sent");
      onEmailSent?.();
    }
  }

  async function oauth(provider: "google") {
    setError(null);
    setOauthPending(true);
    track("sign_in_started", { method: "google", source });
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
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

  return (
    <>
      {/* Email magic link */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendLink();
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-body text-graphite outline-none focus:border-accent/50"
        />
        <GentleButton
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          className="mt-3"
          disabled={!emailValid || emailStatus === "sending"}
          aria-busy={emailStatus === "sending"}
        >
          {emailStatus === "sending" ? "Sending…" : "Send a sign-in link"}
        </GentleButton>
      </form>

      <Divider />

      <GentleButton
        type="button"
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
