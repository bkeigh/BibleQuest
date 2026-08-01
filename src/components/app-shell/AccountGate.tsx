"use client";

import Link from "next/link";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { useSession } from "@/lib/supabase/useSession";
import {
  GATED_SURFACE_COPY,
  isAccountGateActive,
  type GatedSurface,
} from "@/lib/features/account-gate";

/**
 * Asks for an account before the surfaces that accumulate something losable.
 *
 * Three things this deliberately does not do. It does not gate reading — the
 * Bible, a verse, a passage, and MyShepherd stay open to anyone who arrives,
 * because a stranger should be able to read Scripture without being asked who
 * they are. It does not gate on a first visit only to relent later; the four
 * surfaces are the same four every time. And it does not turn itself on while
 * account sync is contained, so it can never ask a reader to sign up for
 * storage that is not there yet — see `account-gate.ts`.
 *
 * The invitation says what the account keeps, not what the rule is. "Quests
 * count what you have done over weeks; an account keeps that count" is a
 * reason. "Sign in to continue" is a toll booth.
 */
function AccountGateInner({
  surface,
  children,
}: {
  surface: GatedSurface;
  children: React.ReactNode;
}) {
  const { user, loading } = useSession();

  if (!isAccountGateActive() || user) return <>{children}</>;

  // A reader with a valid session should never see the invitation flash
  // between paint and session lookup — that reads as being signed out.
  if (loading) {
    return (
      <PageContainer className="pb-8 pt-6">
        <PaperCard variant="paper" padding="lg">
          <div
            aria-hidden="true"
            className="h-4 w-32 rounded bg-mist/70"
          />
          <div className="mt-4 h-3 w-full rounded bg-mist/50" />
          <div className="mt-2 h-3 w-4/5 rounded bg-mist/50" />
          <span className="sr-only">Checking your account.</span>
        </PaperCard>
      </PageContainer>
    );
  }

  const copy = GATED_SURFACE_COPY[surface];

  return (
    <PageContainer className="pb-8 pt-6">
      <PaperCard variant="atmospheric" padding="lg">
        <span aria-hidden="true" className="inline-block">
          <PixelIcon name="key" size={3} />
        </span>
        <h1 className="mt-3 font-display text-[1.75rem] leading-tight text-graphite">
          {copy.title}
        </h1>
        <p className="mt-3 text-body leading-relaxed text-charcoal">
          {copy.reason}
        </p>
        <p className="mt-3 text-small leading-relaxed text-ash">
          Reading stays open either way. The Bible, any verse, and MyShepherd
          never ask you to sign in.
        </p>
        <GentleLink
          href="/app/account"
          variant="primary"
          fullWidth
          className="mt-6"
        >
          Make an account
        </GentleLink>
        <Link
          href="/app/bible"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center text-small font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Go read instead
        </Link>
      </PaperCard>
    </PageContainer>
  );
}

export function AccountGate({
  surface,
  children,
}: {
  surface: GatedSurface;
  children: React.ReactNode;
}) {
  return (
    <ClientOnly>
      <AccountGateInner surface={surface}>{children}</AccountGateInner>
    </ClientOnly>
  );
}
