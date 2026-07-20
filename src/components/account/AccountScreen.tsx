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
import { IconCheck } from "@/components/design-system/icons";
import { SignInMethods } from "./SignInMethods";
import { track } from "@/lib/analytics/events";
import {
  authFailureMessage,
  parseAuthFailureReason,
} from "@/lib/auth/errors";

function AccountInner() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, configured } = useSession();
  const sync = useSyncStatus();

  // A failed magic link / OAuth round-trip lands here as ?error=signin
  // (src/app/auth/callback/route.ts). This component only renders on the
  // client (ClientOnly), so the URL is readable at first render.
  const [callbackFailure] = useState(() =>
    typeof window === "undefined"
      ? null
      : parseAuthFailureReason(
          new URLSearchParams(window.location.search).get("error"),
        ),
  );

  // Clean the error out of the URL so a refresh doesn't re-show it.
  useEffect(() => {
    if (!callbackFailure) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "")
    );
  }, [callbackFailure]);

  if (!configured) {
    return (
      <Frame title="Your account">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p className="text-small leading-relaxed text-ash">
            Cross-device sync isn’t available yet. Your journey is stored in
            this browser on this device.
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

  async function signOut() {
    const { error } = await createClient().auth.signOut();
    if (error) {
      // supabase-js keeps the local session when the revoke call fails
      // (offline / 5xx), so telling the user they're signed out would be a
      // lie — and on a shared device, a dangerous one.
      toast("Couldn’t sign out just now. Check your connection and retry.");
      return;
    }
    track("sign_out");
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
            Your prayers and reflections sync only to your BibleQuest account
            behind per-user access controls. Journal text is excluded from
            analytics and is not sent to AI.
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

      {callbackFailure && (
        <div
          role="alert"
          className="mb-4 rounded-[var(--radius-card)] border border-rose-300 px-4 py-3"
        >
          <p className="text-small leading-relaxed text-rose-700">
            {authFailureMessage(callbackFailure)}
          </p>
          <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.08em] text-ash">
            Reference: AUTH-CALLBACK-{callbackFailure.replaceAll("_", "-")}
          </p>
        </div>
      )}

      <PaperCard variant="paper" padding="lg">
        <p className="text-small leading-relaxed text-charcoal">
          Without an account, your journey stays in this browser. A free
          account syncs it across devices behind per-user access controls;
          journal text stays out of analytics and AI.
        </p>

        <ul className="mt-4 space-y-2">
          {[
            "Your quest progress, streaks, and milestones carry across devices.",
            "Prayers and reflections sync to your protected account.",
            "Reinstall or switch phones without losing your journey.",
            "Pick up on any device, right where you left off.",
          ].map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5">
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-surface text-accent">
                <IconCheck size={11} />
              </span>
              <span className="text-small leading-relaxed text-charcoal">
                {benefit}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <SignInMethods source="account" />
        </div>
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
