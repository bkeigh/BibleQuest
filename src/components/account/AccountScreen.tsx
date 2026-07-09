"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/supabase/useSession";
import { createClient } from "@/lib/supabase/client";
import { useSyncStatus } from "@/lib/sync/status";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import { useToast } from "@/components/design-system/Toast";

type EmailStatus = "idle" | "sending" | "sent";
type PhoneStatus = "idle" | "sending" | "code-sent" | "verifying";

// E.164: a leading + and 7–15 digits (first digit non-zero).
const E164 = /^\+[1-9]\d{6,14}$/;
// Loose email shape check — the real validation is the link arriving.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const RESEND_COOLDOWN_SECONDS = 30;

function AccountInner() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, configured } = useSession();
  const sync = useSyncStatus();

  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>("idle");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A failed magic link / OAuth round-trip lands here as ?error=signin
  // (src/app/auth/callback/route.ts). This component only renders on the
  // client (ClientOnly), so the URL is readable at first render.
  const [callbackFailed] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("error") === "signin"
  );

  // Clean the error out of the URL so a refresh doesn't re-show it.
  useEffect(() => {
    if (!callbackFailed) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") !== "signin") return;
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "")
    );
  }, [callbackFailed]);

  // Tick the OTP resend cooldown down once a second.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  if (!configured) {
    return (
      <Frame title="Your account">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p className="text-small leading-relaxed text-ash">
            Cross-device sync isn’t available yet. Everything stays private on
            this device.
          </p>
        </PaperCard>
      </Frame>
    );
  }

  if (loading) {
    return (
      <Frame title="Your account">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p className="text-small text-ash">One moment…</p>
        </PaperCard>
      </Frame>
    );
  }

  const emailValid = EMAIL.test(email.trim());

  async function sendLink() {
    if (!EMAIL.test(email.trim())) return;
    setError(null);
    setEmailStatus("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("We couldn’t send the link. Please try again in a moment.");
      setEmailStatus("idle");
    } else {
      setEmailStatus("sent");
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
    // On success, onAuthStateChange updates the session and this view swaps to
    // the signed-in state automatically.
  }

  async function oauth(provider: "google") {
    setError(null);
    setOauthPending(true);
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

  async function signOut() {
    await createClient().auth.signOut();
    toast("Signed out. Your journey stays on this device.");
    router.refresh();
  }

  if (user) {
    return (
      <Frame title="Your account" subtitle="Your progress, on every device.">
        <PaperCard variant="paper" padding="lg">
          <p className="text-caption uppercase tracking-[0.16em] text-accent">
            Signed in
          </p>
          <p className="mt-1 text-[1.0625rem] text-graphite">
            {user.email ?? user.phone ?? "your account"}
          </p>
          <p aria-live="polite" className="mt-1.5 text-caption text-ash">
            {sync.state === "syncing"
              ? "Syncing…"
              : sync.state === "error"
                ? "Sync will retry soon. Everything is safe on this device."
                : sync.lastSyncedAt
                  ? "Synced across your devices."
                  : "Sync starts shortly."}
          </p>
          <p className="mt-3 text-small leading-relaxed text-ash">
            Your prayers and reflections stay private — kept only for you, never
            shared.
          </p>
          <GentleButton
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={signOut}
          >
            Sign out
          </GentleButton>
        </PaperCard>
      </Frame>
    );
  }

  return (
    <Frame
      title="Sign in"
      subtitle="Optional — everything works without an account."
    >
      <PixelMascot name="key" size={9} title="Sign in" className="mb-6" />

      {callbackFailed && (
        <div
          role="alert"
          className="mb-4 rounded-[var(--radius-card)] border border-rose-300 px-4 py-3"
        >
          <p className="text-small leading-relaxed text-rose-700">
            That sign-in link didn’t work — it may have expired. Send yourself
            a fresh one below.
          </p>
        </div>
      )}

      <PaperCard variant="paper" padding="lg">
        <p className="text-small leading-relaxed text-charcoal">
          Everything you do here lives on this device. Sign in to back it up
          and use it on your other devices. Your prayers and reflections stay
          private, always.
        </p>

        {emailStatus === "sent" ? (
          <div className="mt-5">
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
        ) : phoneStatus === "code-sent" || phoneStatus === "verifying" ? (
          <div className="mt-5">
            <label
              htmlFor="account-code"
              className="mb-1.5 block text-caption text-ash"
            >
              Enter the code sent to {phone.trim()}
            </label>
            <input
              id="account-code"
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
          </div>
        ) : (
          <>
            {/* Email magic link */}
            <div className="mt-5">
              <label
                htmlFor="account-email"
                className="mb-1.5 block text-caption text-ash"
              >
                Email
              </label>
              <input
                id="account-email"
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
                htmlFor="account-phone"
                className="mb-1.5 block text-caption text-ash"
              >
                Phone
              </label>
              <input
                id="account-phone"
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
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-caption text-rose-700">
            {error}
          </p>
        )}
      </PaperCard>
    </Frame>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-caption text-ash">
      <span className="h-px flex-1 bg-mist" />
      or
      <span className="h-px flex-1 bg-mist" />
    </div>
  );
}

function Frame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageContainer className="pb-8">{children}</PageContainer>
    </>
  );
}

export function AccountScreen() {
  return (
    <ClientOnly>
      <AccountInner />
    </ClientOnly>
  );
}
