"use client";

import Link from "next/link";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClock,
} from "@/components/design-system/icons";
import { usePlus } from "@/lib/billing/usePlus";
import {
  guidedProgressPercent,
  makeGuidedSessionKey,
} from "@/lib/guided/progress";
import type { PilgrimageDefinition } from "@/lib/guided/types";
import { useQuestOS } from "@/lib/questos/store";
import { GuidedProgressBar } from "./GuidedProgressBar";

function PilgrimageDetailInner({
  pilgrimage,
}: {
  pilgrimage: PilgrimageDefinition;
}) {
  const progress = useQuestOS((state) => state.guidedProgress);
  const plus = usePlus();
  const checkingAccess = pilgrimage.access === "plus" && plus.loading;
  const gated =
    pilgrimage.access === "plus" && !plus.loading && !plus.isPlus;
  const dayProgress = pilgrimage.days.map(
    (day) =>
      progress[makeGuidedSessionKey("pilgrimage_day", day.id)],
  );
  const completedDays = dayProgress.filter((entry) => entry?.completedAt).length;
  const percent = Math.round(
    dayProgress.reduce(
      (sum, entry) => sum + guidedProgressPercent(entry),
      0,
    ) / pilgrimage.days.length,
  );

  return (
    <PageContainer className="pb-12 pt-safe">
      <Link
        href="/app/pilgrimages"
        className="inline-flex min-h-11 items-center gap-1.5 pt-4 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
      >
        <IconArrowLeft size={16} /> Pilgrimages
      </Link>

      <PaperCard variant="atmospheric" padding="lg" className="mt-5">
        <p className="font-pixel text-[0.8125rem] uppercase tracking-[0.1em] text-accent">
          {pilgrimage.access === "plus" ? "Plus Pilgrimage" : "Free Pilgrimage"}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-tight text-graphite">
          {pilgrimage.title}
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-charcoal">
          {pilgrimage.description}
        </p>
        <p className="mt-5 flex items-center gap-2 text-[0.8125rem] text-ash">
          <IconClock size={15} />
          {pilgrimage.estimatedDays} days · about{" "}
          {pilgrimage.estimatedMinutesPerDay} minutes a day
        </p>
        <div className="mt-5">
          <GuidedProgressBar
            value={percent}
            label={`${completedDays} of ${pilgrimage.days.length} days complete`}
          />
        </div>
      </PaperCard>

      {checkingAccess && (
        <PaperCard
          role="status"
          aria-live="polite"
          variant="quiet"
          padding="md"
          className="mt-4"
        >
          <p className="text-[0.875rem] text-ash">Checking Plus access…</p>
        </PaperCard>
      )}

      {gated && (
        <PaperCard variant="quiet" padding="md" className="mt-4">
          <h2 className="font-display text-[1.25rem] text-graphite">
            A deeper guided path with Plus
          </h2>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-ash">
            Core Scripture, prayer, reflection, and the complete Learning to
            Remain Pilgrimage stay free. Plus adds this additional reviewed path
            and supports future guided content.
          </p>
          <GentleLink
            href="/app/plus"
            variant="gold"
            fullWidth
            className="mt-4"
          >
            Explore Plus
            <IconArrowRight />
          </GentleLink>
        </PaperCard>
      )}

      <section aria-labelledby="pilgrimage-days" className="mt-7">
        <h2
          id="pilgrimage-days"
          className="font-pixel text-[1.375rem] uppercase tracking-[0.05em] text-accent"
        >
          The path
        </h2>
        <ol className="mt-3 space-y-3">
          {pilgrimage.days.map((day, index) => {
            const entry = dayProgress[index];
            const previousComplete =
              index === 0 || Boolean(dayProgress[index - 1]?.completedAt);
            // Previously-started days remain available after merges even if an
            // older preceding row has not reached this device yet.
            const available =
              !gated &&
              !checkingAccess &&
              (previousComplete || Boolean(entry));
            const href = `/app/pilgrimages/${pilgrimage.slug}/${index + 1}`;
            const status = entry?.completedAt
              ? "Complete"
              : entry
                ? "In progress"
                : available
                  ? "Ready"
                  : checkingAccess
                    ? "Checking access"
                    : gated
                    ? "Plus"
                    : "After the previous day";

            return (
              <li key={day.id}>
                <PaperCard variant="paper" padding="md">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-surface font-pixel text-[0.8125rem] text-accent">
                      {entry?.completedAt ? <IconCheck size={18} /> : index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-display text-[1.125rem] text-graphite">
                          {day.title}
                        </h3>
                        <span className="text-[0.6875rem] uppercase tracking-[0.08em] text-ash">
                          {status}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.8125rem] leading-relaxed text-ash">
                        {day.summary}
                      </p>
                      <p className="mt-2 text-[0.75rem] text-ash">
                        {day.scripture.reference} · about {day.durationMinutes} min
                      </p>
                      {available && (
                        <GentleLink
                          href={href}
                          variant="text"
                          size="sm"
                          className="mt-3"
                        >
                          {entry?.completedAt
                            ? "Return"
                            : entry
                              ? "Resume"
                              : "Start day"}
                          <IconArrowRight size={15} />
                        </GentleLink>
                      )}
                    </div>
                  </div>
                </PaperCard>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="mt-6 text-center text-[0.75rem] leading-relaxed text-ash">
        Continue in order when you can. No day expires, and returning after time
        away never reduces progress.
      </p>
    </PageContainer>
  );
}

export function PilgrimageDetail({
  pilgrimage,
}: {
  pilgrimage: PilgrimageDefinition;
}) {
  return (
    <ClientOnly>
      <PilgrimageDetailInner pilgrimage={pilgrimage} />
    </ClientOnly>
  );
}
