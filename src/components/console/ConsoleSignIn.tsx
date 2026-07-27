"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authCallbackPath } from "@/lib/auth/redirect";
import { isConsoleHost } from "@/lib/console/paths";
import { recordConsoleSignIn } from "@/app/console/(protected)/actions";

type SignInState = "idle" | "sending" | "sent" | "verifying";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OTP = /^\d{6,8}$/;

/** Provides operator-only passwordless auth without product analytics. */
export function ConsoleSignIn() {
  const [email, setEmail] = useState("");
  const [requestedEmail, setRequestedEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<SignInState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const emailReady = EMAIL.test(email.trim());
  const codeReady = OTP.test(code);

  /** Returns the clean console root on its dedicated host and preview path elsewhere. */
  function returnPath() {
    return isConsoleHost(window.location.hostname) ? "/" : "/console";
  }

  /** Requests a magic link without allowing console enrollment to create users. */
  async function requestSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (!emailReady || state === "sending") return;

    setMessage(null);
    setState("sending");
    const address = email.trim().toLowerCase();
    try {
      const callback = new URL(
        authCallbackPath(returnPath()),
        window.location.origin,
      ).toString();
      const { error } = await createClient().auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: callback, shouldCreateUser: false },
      });
      if (error) throw error;
      setRequestedEmail(address);
      setState("sent");
    } catch {
      setState("idle");
      setMessage("Sign-in request failed. Check the address and try again.");
    }
  }

  /** Completes the one-time email code in the current browser session. */
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!codeReady || state === "verifying") return;

    setMessage(null);
    setState("verifying");
    try {
      const { error } = await createClient().auth.verifyOtp({
        email: requestedEmail,
        token: code,
        type: "email",
      });
      if (error) throw error;
      try {
        await recordConsoleSignIn();
      } catch {
        // Audit availability never blocks a verified operator session.
      }
      window.location.assign(returnPath());
    } catch {
      setState("sent");
      setMessage("Code invalid or expired. Request a fresh sign-in email.");
    }
  }

  if (state === "sent" || state === "verifying") {
    return (
      <form onSubmit={verifyCode} className="mt-7">
        <div className="rounded-[12px] border border-evergreen-100 bg-evergreen-50 px-4 py-3 text-caption leading-relaxed text-evergreen-800">
          Secure email sent to <strong>{requestedEmail}</strong>.
        </div>
        <label htmlFor="console-code" className="console-field-label">
          One-time code
        </label>
        <input
          id="console-code"
          className="console-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 8))
          }
          placeholder="000000"
        />
        {message ? <p className="console-form-error">{message}</p> : null}
        <button
          type="submit"
          className="console-primary-button"
          disabled={!codeReady || state === "verifying"}
        >
          {state === "verifying" ? "Verifying…" : "Enter Console"}
        </button>
        <button
          type="button"
          className="console-text-button"
          onClick={() => {
            setState("idle");
            setCode("");
            setMessage(null);
          }}
        >
          Use another email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestSignIn} className="mt-7">
      <label htmlFor="console-email" className="console-field-label">
        Operator email
      </label>
      <input
        id="console-email"
        className="console-input"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@biblequest.co"
      />
      {message ? <p className="console-form-error">{message}</p> : null}
      <button
        type="submit"
        className="console-primary-button"
        disabled={!emailReady || state === "sending"}
      >
        {state === "sending" ? "Sending…" : "Send secure sign-in"}
      </button>
    </form>
  );
}
