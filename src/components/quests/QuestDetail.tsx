"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { QuestTemplate, ReflectionMood } from "@/lib/questos/types";
import { useQuestOS, selectTodayPicks } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon, CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";
import {
  IconArrowLeft,
  IconClock,
  IconCheck,
  IconPlus,
} from "@/components/design-system/icons";
import { MoodPicker } from "@/components/reflection/MoodPicker";
import { formatDuration, CATEGORY_LABEL } from "@/components/quests/QuestSlip";
import { completionLine, questPicks } from "@/lib/questos/copy";
import { gentleEase, celebrationScale, pixelSparkle } from "@/lib/motion";
import { cleanVerseText } from "@/lib/utils/scripture";
import { toDateKey, hashString } from "@/lib/utils/dates";
import { track } from "@/lib/analytics/events";

type Phase = "detail" | "reflect" | "done";

/** Star positions for the small done-moment flourish. */
const SPARKLES = ["-right-2 -top-1", "-left-3 bottom-2", "right-1 -bottom-2"];

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.75rem] uppercase tracking-wide text-ash">{label}</dt>
      <dd className="mt-0.5 text-small capitalize text-charcoal">{value}</dd>
    </div>
  );
}

function QuestDetailInner({ quest }: { quest: QuestTemplate }) {
  const { toast } = useToast();
  const completeQuestBySlug = useQuestOS((s) => s.completeQuestBySlug);
  const pickQuest = useQuestOS((s) => s.pickQuest);
  const startQuest = useQuestOS((s) => s.startQuest);
  const picks = useQuestOS(selectTodayPicks);
  const completions = useQuestOS((s) => s.completions);

  const [phase, setPhase] = useState<Phase>("detail");
  const [reflection, setReflection] = useState("");
  const [mood, setMood] = useState<ReflectionMood | undefined>();
  const reflectionFieldId = useId();

  const todayPick = picks.find((a) => a.questSlug === quest.slug);
  const alreadyCompletedToday = completions.some(
    (c) => c.questSlug === quest.slug && c.dateKey === toDateKey()
  );

  useEffect(() => {
    track("quest_viewed", { category: quest.category });
  }, [quest.slug, quest.category]);

  function addToToday() {
    if (pickQuest(quest.slug)) {
      toast(questPicks.added, { variant: "success" });
    } else {
      toast(questPicks.capReached);
    }
  }

  function begin() {
    startQuest(quest.slug);
    setPhase("reflect");
  }

  function finish(withReflection: boolean) {
    const hasText = withReflection && reflection.trim().length > 0;
    completeQuestBySlug(
      quest.slug,
      hasText ? { body: reflection, mood } : undefined
    );
    toast(hasText ? "Done. Reflection saved." : "Quest complete.", {
      variant: "celebrate",
    });
    setPhase("done");
  }

  const doneLine = completionLine(hashString(quest.slug));
  const doneBody = doneLine.toLowerCase().includes("tree")
    ? "It's part of today now."
    : "Your tree grew a little.";

  return (
    <PageContainer className="pt-safe">
      <div className="pt-6">
        <Link
          href="/app/quests"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> Quests
        </Link>
      </div>

      <AnimatePresence mode="wait">
        {phase === "detail" && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: gentleEase }}
            className="pb-8"
          >
            <div className="mt-5 flex items-center gap-3">
              <span className="rounded-[12px] bg-linen p-2.5 ring-1 ring-mist">
                <PixelIcon name={CATEGORY_SPRITE[quest.category] ?? "leaf"} size={6} />
              </span>
              <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ash">
                <IconClock size={14} /> {formatDuration(quest.durationMinutes)}
                <span className="text-mist">·</span>
                <span className="font-pixel text-[0.875rem] text-accent">
                  {CATEGORY_LABEL[quest.category]}
                </span>
              </span>
            </div>

            <h1 className="mt-4 font-display text-editorial text-graphite">
              {quest.title}
            </h1>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-charcoal">
              {quest.invitation}
            </p>

            <PaperCard variant="quiet" padding="md" className="mt-5">
              <p className="text-[0.75rem] uppercase tracking-wide text-accent">
                Why it matters
              </p>
              <p className="mt-1.5 text-small leading-relaxed text-charcoal">
                {quest.whyItMatters}
              </p>
            </PaperCard>

            {/* Scripture */}
            <PaperCard variant="atmospheric" padding="md" className="mt-4">
              {quest.scriptureText && (
                <blockquote className="verse-text">
                  “{cleanVerseText(quest.scriptureText)}”
                </blockquote>
              )}
              <cite className="mt-2 block text-[0.875rem] not-italic text-ash">
                — {quest.scriptureReference}
                <span className="text-fog"> · World English Bible</span>
              </cite>
            </PaperCard>

            {/* Metadata */}
            <dl className="mt-5 grid grid-cols-3 gap-4">
              <Meta label="Difficulty" value={quest.difficulty} />
              <Meta label="Energy" value={quest.energyLevel} />
              <Meta label="Setting" value={quest.soloOrSocial} />
            </dl>

            {/* Sensitivity note — safety framing */}
            {quest.sensitivityTags.length > 0 && (
              <SensitivityNote tags={quest.sensitivityTags} />
            )}

            {/* Prayer before starting */}
            <PaperCard variant="linen" padding="md" className="mt-5">
              <p className="text-[0.75rem] uppercase tracking-wide text-gilt">
                A prayer to begin
              </p>
              <p className="mt-1.5 text-[1rem] italic text-charcoal">
                “{quest.prayerPrompt}”
              </p>
            </PaperCard>

            <div className="mt-6">
              {alreadyCompletedToday ? (
                <PaperCard variant="quiet" padding="md" className="text-center">
                  <p className="text-small text-charcoal">Already done today.</p>
                  <GentleLink variant="text" href="/app/journey" className="mt-2">
                    See your journey
                  </GentleLink>
                </PaperCard>
              ) : todayPick ? (
                <GentleButton variant="primary" size="lg" fullWidth onClick={begin}>
                  Begin quest
                </GentleButton>
              ) : (
                <div className="space-y-2.5">
                  <GentleButton
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={addToToday}
                  >
                    <IconPlus size={18} /> Add to today
                  </GentleButton>
                  <button
                    type="button"
                    onClick={() => setPhase("reflect")}
                    className="w-full py-2 text-center text-small text-ash transition-colors hover:text-charcoal"
                  >
                    Begin without adding
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {phase === "reflect" && (
          <motion.div
            key="reflect"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: gentleEase }}
            className="pb-8"
          >
            <div className="mt-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent-surface ring-1 ring-accent/20">
                <PixelIcon name="leaf" size={6} animate />
              </div>
              <h2 className="font-display text-editorial text-graphite">
                Before you go
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-small text-ash">
                Take a breath. Write if something stood out — it’s always
                optional.
              </p>
            </div>

            <PaperCard variant="paper" padding="md" className="mt-6">
              <label
                htmlFor={reflectionFieldId}
                className="block text-small font-medium text-graphite"
              >
                {quest.reflectionPrompt}
              </label>
              <textarea
                id={reflectionFieldId}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={5}
                placeholder="Write freely, or leave this blank…"
                className="mt-3 w-full resize-none rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-3 text-[1rem] leading-relaxed text-graphite outline-none transition-colors focus:border-accent/50"
              />
              <div className="mt-3">
                <MoodPicker value={mood} onChange={setMood} />
              </div>
            </PaperCard>

            <div className="mt-5 space-y-2.5">
              <GentleButton
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => finish(true)}
              >
                <IconCheck size={18} /> Complete quest
              </GentleButton>
              <button
                type="button"
                onClick={() => finish(false)}
                className="w-full py-2 text-center text-small text-ash transition-colors hover:text-charcoal"
              >
                Complete without writing
              </button>
            </div>
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div
            key="done"
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: gentleEase }}
            className="flex min-h-[60vh] flex-col items-center justify-center pb-8 text-center"
          >
            <div className="relative mb-4">
              <motion.div
                variants={celebrationScale}
                initial="hidden"
                animate="visible"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-surface ring-1 ring-accent/20"
              >
                <PixelIcon
                  name={quest.growthType === "flowers" ? "flower" : "leaf"}
                  size={8}
                  animate
                />
              </motion.div>
              {SPARKLES.map((position, i) => (
                <motion.span
                  key={position}
                  aria-hidden
                  custom={i + 1}
                  variants={pixelSparkle}
                  initial="hidden"
                  animate="visible"
                  className={`ambient absolute ${position}`}
                >
                  <PixelIcon name="star" size={2} />
                </motion.span>
              ))}
            </div>
            <h2 className="font-display text-editorial text-graphite">
              {doneLine}
            </h2>
            <p className="mt-2 max-w-xs text-small text-ash">{doneBody}</p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <GentleLink variant="outline" href="/app/journey">
                See your journey
              </GentleLink>
              <GentleLink variant="text" href="/app">
                Return home
              </GentleLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}

const SENSITIVITY_COPY: Record<string, string> = {
  forgiveness_sensitive:
    "This is inner work between you and God. You never have to contact anyone, and you are not obligated to reconcile. Your safety matters.",
  relationship_sensitive:
    "Go only as far as feels safe and healthy. Boundaries can be faithful too.",
  grief_sensitive:
    "Be gentle with yourself. If grief feels heavy, it may help to reach out to someone you trust.",
  money_sensitive: "Give only within your means. Never give what you need.",
  discipline_sensitive:
    "Keep this small and safe. This is about media, comfort, or habits — never food or health.",
};

function SensitivityNote({ tags }: { tags: string[] }) {
  const note = tags.map((t) => SENSITIVITY_COPY[t]).find(Boolean);
  if (!note) return null;
  return (
    <div className="mt-4 rounded-[var(--radius-button)] border border-marian-100 bg-marian-50 px-4 py-3">
      <p className="text-[0.875rem] leading-relaxed text-marian-700">{note}</p>
    </div>
  );
}

export function QuestDetail({ quest }: { quest: QuestTemplate }) {
  return (
    <ClientOnly>
      <QuestDetailInner quest={quest} />
    </ClientOnly>
  );
}
