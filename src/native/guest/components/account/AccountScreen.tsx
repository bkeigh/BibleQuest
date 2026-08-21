"use client";

import { ClientOnly } from "@/components/app-shell/ClientOnly";
import {
  PageContainer,
  PageHeader,
} from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { ACCOUNT_SYNC_CONTAINMENT_NOTICE } from "@/lib/sync/containment";

/** Shows the exact device-only posture without importing customer auth code. */
function GuestAccountScreen() {
  return (
    <>
      <PageHeader title="Your journey" subtitle="Saved privately on this device." />
      <PageContainer className="pb-8">
        <PaperCard variant="quiet" padding="lg" className="text-center">
          <p role="status" className="text-small leading-relaxed text-ash">
            {ACCOUNT_SYNC_CONTAINMENT_NOTICE}
          </p>
          <p className="mt-3 text-caption leading-relaxed text-ash">
            You can export a readable backup or clear your journey at any time
            from Settings.
          </p>
        </PaperCard>
      </PageContainer>
    </>
  );
}

/** Keeps the static account route informative for existing guest navigation. */
export function AccountScreen() {
  return (
    <ClientOnly>
      <GuestAccountScreen />
    </ClientOnly>
  );
}
