"use client";

import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { IconArrowRight } from "@/components/design-system/icons";
import { usePlus } from "@/lib/billing/usePlus";
import { makeGuidedSessionKey } from "@/lib/guided/progress";
import type {
  GuidedPractice,
  PilgrimageDefinition,
} from "@/lib/guided/types";
import { GuidedPracticeRunner } from "./GuidedPracticeRunner";
import { useQuestOS } from "@/lib/questos/store";

function PilgrimageDayInner({
  pilgrimage,
  practice,
  dayNumber,
}: {
  pilgrimage: PilgrimageDefinition;
  practice: GuidedPractice;
  dayNumber: number;
}) {
  const plus = usePlus();
  const progress = useQuestOS((state) => state.guidedProgress);
  const currentSessionKey = makeGuidedSessionKey(
    "pilgrimage_day",
    practice.id,
  );
  const currentStarted = Boolean(progress[currentSessionKey]);
  const previousPractice =
    dayNumber > 1 ? pilgrimage.days[dayNumber - 2] : undefined;
  const previousComplete =
    !previousPractice ||
    Boolean(
      progress[
        makeGuidedSessionKey("pilgrimage_day", previousPractice.id)
      ]?.completedAt,
    );

  if (pilgrimage.access === "plus" && plus.loading) {
    return (
      <PageContainer className="pb-12 pt-safe">
        <PaperCard
          role="status"
          aria-live="polite"
          variant="quiet"
          padding="lg"
          className="mt-8 text-center"
        >
          <p className="text-[0.9375rem] text-ash">Checking Plus access…</p>
        </PaperCard>
      </PageContainer>
    );
  }

  if (pilgrimage.access === "plus" && !plus.isPlus) {
    return (
      <PageContainer className="pb-12 pt-safe">
        <PaperCard variant="atmospheric" padding="lg" className="mt-8 text-center">
          <p className="font-art-label text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
            Plus Pilgrimage
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] text-graphite">
            {pilgrimage.title}
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-charcoal">
            This reviewed path is included with BibleQuest Plus. The complete
            Learning to Remain path remains available.
          </p>
          <GentleLink href="/app/plus" variant="gold" fullWidth className="mt-6">
            Explore Plus
            <IconArrowRight />
          </GentleLink>
          <GentleLink
            href={`/app/pilgrimages/${pilgrimage.slug}`}
            variant="text"
            className="mt-4"
          >
            Back to path
          </GentleLink>
        </PaperCard>
      </PageContainer>
    );
  }

  if (!previousComplete && !currentStarted) {
    return (
      <PageContainer className="pb-12 pt-safe">
        <PaperCard variant="quiet" padding="lg" className="mt-8 text-center">
          <p className="font-art-label text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
            Day {dayNumber}
          </p>
          <h1 className="mt-2 font-display text-[1.625rem] text-graphite">
            This day follows the one before it
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-charcoal">
            Continue the previous practice whenever you are ready. Nothing
            expires, and time away never reduces your progress.
          </p>
          <GentleLink
            href={`/app/pilgrimages/${pilgrimage.slug}`}
            variant="primary"
            fullWidth
            className="mt-6"
          >
            Return to the path
            <IconArrowRight />
          </GentleLink>
        </PaperCard>
      </PageContainer>
    );
  }

  return (
    <GuidedPracticeRunner
      practice={practice}
      sessionKey={currentSessionKey}
      kind="pilgrimage_day"
      backHref={`/app/pilgrimages/${pilgrimage.slug}`}
      backLabel={pilgrimage.title}
      contextLabel={`Day ${dayNumber} of ${pilgrimage.days.length}`}
    />
  );
}

export function PilgrimageDay(props: {
  pilgrimage: PilgrimageDefinition;
  practice: GuidedPractice;
  dayNumber: number;
}) {
  return (
    <ClientOnly>
      <PilgrimageDayInner {...props} />
    </ClientOnly>
  );
}
