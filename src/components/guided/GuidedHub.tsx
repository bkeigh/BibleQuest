"use client";

import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { IconArrowRight, IconClock } from "@/components/design-system/icons";
import {
  guidedScriptureForDate,
  pilgrimages,
} from "@/data/guided/content";
import {
  guidedProgressPercent,
  makeGuidedSessionKey,
} from "@/lib/guided/progress";
import { useQuestOS } from "@/lib/questos/store";
import { toDateKey } from "@/lib/utils/dates";
import { GuidedProgressBar } from "./GuidedProgressBar";
import { GREEN_FEATURES } from "@/lib/features/green";

/** Hydrated daily guide invitation with an honest Start or Resume state. */
function GuidedHubInner() {
  const dateKey = toDateKey();
  const guide = guidedScriptureForDate(dateKey);
  const sessionKey = makeGuidedSessionKey("daily", guide.id, dateKey);
  const progress = useQuestOS((state) => state.guidedProgress[sessionKey]);
  const completed = Boolean(progress?.completedAt);
  const pilgrimageCount = pilgrimages.length;

  return (
    <>
      <PageHeader
        title="Guided Scripture"
        subtitle="Arrive, read, notice, reflect, respond, and pray."
      />
      <PageContainer className="pb-12 pt-4">
        <PaperCard as="section" variant="atmospheric" padding="lg">
          <p className="font-art-label text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
            Today’s guide
          </p>
          <h2 className="mt-2 font-display text-[1.75rem] leading-tight text-graphite">
            {guide.title}
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
            {guide.summary}
          </p>
          <p className="mt-4 flex items-center gap-2 text-[0.8125rem] text-ash">
            <IconClock size={15} />
            About {guide.durationMinutes} minutes · {guide.scripture.reference} ·
            WEB
          </p>
          {progress && (
            <div className="mt-5">
              <GuidedProgressBar
                value={guidedProgressPercent(progress)}
                label={
                  completed
                    ? "Today’s guide complete"
                    : "Today’s guide progress"
                }
              />
            </div>
          )}
          <GentleLink
            href="/app/guided/daily"
            variant="primary"
            fullWidth
            className="mt-6"
          >
            {completed ? "Return to today’s guide" : progress ? "Resume" : "Start"}
            <IconArrowRight />
          </GentleLink>
        </PaperCard>

        {GREEN_FEATURES.pilgrimages && (
          <PaperCard as="section" variant="quiet" padding="md" className="mt-5">
            <p className="font-art-label text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
              Pilgrimages
            </p>
            <h2 className="mt-2 font-display text-[1.375rem] text-graphite">
              Follow a path over several days
            </h2>
            <p className="mt-2 text-[0.875rem] leading-relaxed text-ash">
              {pilgrimageCount} reviewed paths are ready. Missed days never
              erase progress; return whenever you are able.
            </p>
            <GentleLink
              href="/app/pilgrimages"
              variant="outline"
              fullWidth
              className="mt-4"
            >
              Browse Pilgrimages
              <IconArrowRight />
            </GentleLink>
          </PaperCard>
        )}

        <p className="mx-auto mt-6 max-w-lg text-center text-[0.75rem] leading-relaxed text-ash">
          Guide completion is only a bookmark. Scripture reading, reflections,
          prayers, and lived quests keep shaping Journey through their existing
          actions.
        </p>
      </PageContainer>
    </>
  );
}

/** Keeps local progress out of the server and first hydration paint. */
export function GuidedHub() {
  return (
    <ClientOnly>
      <GuidedHubInner />
    </ClientOnly>
  );
}
