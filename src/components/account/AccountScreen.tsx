"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/supabase/useSession";
import { createClient } from "@/lib/supabase/client";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { useToast } from "@/components/design-system/Toast";

type Status = "idle" | "sending" | "sent";

function AccountInner() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, configured } = useSession();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!configured) {
    return (
      <Frame title="Your account">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p className="text-[0.9375rem] leading-relaxed text-ash">
            Cross-device sync isn’t available yet. Your journey is safe and
            private on this device.
          </p>
        </PaperCard>
      </Frame>
    );
  }

  if (loading) {
    return (
      <Frame title="Your account">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p className="text-[0.9375rem] text-ash">One moment…</p>
        </PaperCard>
      </Frame>
    );
  }

  async function sendLink() {
    if (!email.trim()) return;
    setError(null);
    setStatus("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("We couldn’t send the link. Please try again in a moment.");
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  async function oauth(provider: "google" | "apple") {
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError("We couldn’t start sign-in. Please try again.");
  }

  async function signOut() {
    await createClient().auth.signOut();
    toast("Signed out. Your journey stays on this device.");
    router.refresh();
  }

  if (user) {
    return (
      <Frame
        title="Your account"
        subtitle="Your journey, carried gently across your devices."
      >
        <PaperCard variant="paper" padding="lg">
          <p className="text-[0.8125rem] uppercase tracking-[0.16em] text-olive-500">
            Signed in
          </p>
          <p className="mt-1 text-[1.0625rem] text-graphite">{user.email}</p>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ash">
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
      title="Keep your journey"
      subtitle="Optional — everything works without an account."
    >
      <PaperCard variant="paper" padding="lg">
        <p className="text-[0.9375rem] leading-relaxed text-charcoal">
          Your journey lives on this device. Sign in to keep it safe and carry
          it to your other devices. Always private — your prayers and
          reflections are never shared.
        </p>

        {status === "sent" ? (
          <div className="mt-5 rounded-[var(--radius-card)] bg-olive-50 p-4 text-center">
            <p className="text-[0.9375rem] leading-relaxed text-charcoal">
              Check your email for a sign-in link. You can close this page.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <label
                htmlFor="account-email"
                className="mb-1.5 block text-[0.8125rem] text-ash"
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
                className="w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-[1rem] text-graphite outline-none focus:border-olive-300"
              />
              <GentleButton
                variant="dark"
                size="md"
                fullWidth
                className="mt-3"
                onClick={sendLink}
                disabled={!email.trim() || status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send a sign-in link"}
              </GentleButton>
            </div>

            <div className="my-5 flex items-center gap-3 text-[0.8125rem] text-fog">
              <span className="h-px flex-1 bg-mist" />
              or
              <span className="h-px flex-1 bg-mist" />
            </div>

            <div className="flex flex-col gap-2.5">
              <GentleButton
                variant="outline"
                size="md"
                fullWidth
                onClick={() => oauth("google")}
              >
                Continue with Google
              </GentleButton>
              <GentleButton
                variant="outline"
                size="md"
                fullWidth
                onClick={() => oauth("apple")}
              >
                Continue with Apple
              </GentleButton>
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[0.875rem] text-rose-700">
            {error}
          </p>
        )}
      </PaperCard>
    </Frame>
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
