"use client";

import { useState } from "react";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import {
  GentleButton,
  GentleLink,
} from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PlusFeatureDialog } from "@/components/plus/PlusFeatureDialog";
import { WebCommerceOnly } from "@/components/plus/WebCommerceOnly";
import {
  IconArrowRight,
  IconCheck,
  IconClock,
} from "@/components/design-system/icons";
import { pilgrimages } from "@/data/guided/content";
import {
  guidedProgressPercent,
  makeGuidedSessionKey,
} from "@/lib/guided/progress";
import { usePlus } from "@/lib/billing/usePlus";
import { useQuestOS } from "@/lib/questos/store";
import { GuidedProgressBar } from "./GuidedProgressBar";
import { isNativeTarget } from "@/lib/platform/target";

/** Shows reviewed paths with aggregate Start, Resume, and duration context. */
function PilgrimageCatalogInner() {
  const progress = useQuestOS((state) => state.guidedProgress);
  const plus = usePlus();
  const [lockedPilgrimage, setLockedPilgrimage] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Pilgrimages"
        subtitle="Guided Scripture paths that wait for you."
      />
      <PageContainer className="space-y-5 pb-12 pt-4">
        {pilgrimages.map((pilgrimage) => {
          // Keep acquired paths available while removing locked previews from
          // a native build that has no StoreKit acquisition path.
          if (
            pilgrimage.access === "plus" &&
            !plus.isPlus &&
            isNativeTarget()
          ) {
            return null;
          }

          const dayProgress = pilgrimage.days.map(
            (day) =>
              progress[
                makeGuidedSessionKey("pilgrimage_day", day.id)
              ],
          );
          const completedDays = dayProgress.filter(
            (entry) => entry?.completedAt,
          ).length;
          const started = dayProgress.some(Boolean);
          const complete = completedDays === pilgrimage.days.length;
          const percent = Math.round(
            dayProgress.reduce(
              (sum, entry) => sum + guidedProgressPercent(entry),
              0,
            ) / pilgrimage.days.length,
          );

          return (
            <PaperCard
              key={pilgrimage.id}
              as="article"
              variant={
                pilgrimage.access === "plus" ? "atmospheric" : "paper"
              }
              padding="lg"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-art-label text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
                  {pilgrimage.access === "plus"
                    ? "Plus Pilgrimage"
                    : "Pilgrimage"}
                </p>
                {complete && (
                  <span className="inline-flex items-center gap-1 text-[0.75rem] text-accent">
                    <IconCheck size={15} /> Complete
                  </span>
                )}
              </div>
              <h2 className="mt-2 font-display text-[1.625rem] leading-tight text-graphite">
                {pilgrimage.title}
              </h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal">
                {pilgrimage.summary}
              </p>
              <p className="mt-4 flex items-center gap-2 text-[0.8125rem] text-ash">
                <IconClock size={15} />
                {pilgrimage.estimatedDays} days · about{" "}
                {pilgrimage.estimatedMinutesPerDay} minutes a day
              </p>
              {started && (
                <div className="mt-5">
                  <GuidedProgressBar
                    value={percent}
                    label={`${completedDays} of ${pilgrimage.days.length} days complete`}
                  />
                </div>
              )}
              {pilgrimage.access === "plus" && plus.loading ? (
                <GentleButton
                  variant="gold"
                  fullWidth
                  className="mt-6"
                  disabled
                >
                  Checking Plus access…
                </GentleButton>
              ) : pilgrimage.access === "plus" && !plus.isPlus ? (
                <WebCommerceOnly>
                  <GentleButton
                    variant="gold"
                    fullWidth
                    className="mt-6"
                    onClick={() => setLockedPilgrimage(pilgrimage.title)}
                  >
                    View path · Plus
                    <IconArrowRight />
                  </GentleButton>
                </WebCommerceOnly>
              ) : (
                <GentleLink
                  href={`/app/pilgrimages/${pilgrimage.slug}`}
                  variant={pilgrimage.access === "plus" ? "gold" : "primary"}
                  fullWidth
                  className="mt-6"
                >
                  {complete
                    ? "Return to path"
                    : started
                      ? "Resume"
                      : "View path"}
                  <IconArrowRight />
                </GentleLink>
              )}
            </PaperCard>
          );
        })}

        <PaperCard variant="quiet" padding="sm">
          <p className="text-[0.75rem] leading-relaxed text-ash">
            There are no missed-day penalties and no deadline. Each path keeps
            your place until you are ready to continue.
          </p>
        </PaperCard>
        <PlusFeatureDialog
          open={lockedPilgrimage !== null}
          onClose={() => setLockedPilgrimage(null)}
          title={
            lockedPilgrimage
              ? `Walk ${lockedPilgrimage}`
              : "Open a Plus pilgrimage"
          }
          description="This additional reviewed Guided Scripture path is included with BibleQuest Plus."
        />
      </PageContainer>
    </>
  );
}

export function PilgrimageCatalog() {
  return (
    <ClientOnly>
      <PilgrimageCatalogInner />
    </ClientOnly>
  );
}
