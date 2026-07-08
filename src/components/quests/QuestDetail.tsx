"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { QuestTemplate, ReflectionMood } from "@/lib/questos/types";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon, CATEGORY_SPRITE } from "@/components/design-system/PixelIcon";
import { IconArrowLeft, IconClock, IconCheck } from "@/components/design-system/icons";
import { MoodPicker } from "@/components/reflection/MoodPicker";
import { formatDuration } from "@/components/quests/QuestSlip";
import { completionLine } from "@/lib/questos/copy";
import { cleanVerseText } from "@/lib/utils/scripture";
import { toDateKey, hashString } from "@/lib/utils/dates";

type Phase = "detail" | "reflect" | "done";

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.75rem] uppercase tracking-wide text-ash">{label}</dt>
      <dd className="mt-0.5 text-[0.9375rem] capitalize text-charcoal">{value}</dd>
    </div>
  );
}

function QuestDetailInner({ quest }: { quest: QuestTemplate }) {
  const { toast } = useToast();
  const completeQuestBySlug = useQuestOS((s) => s.completeQuestBySlug);
  const startTodayQuest = useQuestOS((s) => s.startTodayQuest);
  const todayAssignment = useQuestOS((s) => s.assignments[toDateKey()]);
  const completions = useQuestOS((s) => s.completions);

  const [phase, setPhase] = useState<Phase>("detail");
  const [reflection, setReflection] = useState("");
  const [mood, setMood] = useState<ReflectionMood | undefined>();

  const isTodayQuest = todayAssignment?.questSlug === quest.slug;
  const alreadyCompletedToday = completions.some(
    (c) => c.questSlug === quest.slug && c.dateKey === toDateKey()
  );

  function begin() {
    if (isTodayQuest) startTodayQuest();
    setPhase("reflect");
  }

  function finish(withReflection: boolean) {
    completeQuestBySlug(
      quest.slug,
      withReflection && reflection.trim()
        ? { body: reflection, mood }
        : undefined
    );
    toast(withReflection && reflection.trim() ? "Saved to your journey." : "This became part of your journey.");
    setPhase("done");
  }

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
            transition={{ duration: 0.3 }}
            className="pb-8"
          >
            <div className="mt-5 flex items-center gap-3">
              <span className="rounded-[12px] bg-linen p-2.5 ring-1 ring-mist">
                <PixelIcon name={CATEGORY_SPRITE[quest.category] ?? "leaf"} size={6} />
              </span>
              <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ash">
                <IconClock size={14} /> {formatDuration(quest.durationMinutes)}
                <span className="text-mist">·</span>
                <span className="uppercase tracking-wide text-olive-500">
                  {quest.category}
                </span>
              </span>
            </div>

            <h1 className="mt-4 font-display text-[2rem] leading-tight text-graphite">
              {quest.title}
            </h1>
            <p className="mt-3 text-[1.0625rem] leading-relaxed text-charcoal">
              {quest.invitation}
            </p>

            <PaperCard variant="quiet" padding="md" className="mt-5">
              <p className="text-[0.75rem] uppercase tracking-wide text-olive-500">
                Why it matters
              </p>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-charcoal">
                {quest.whyItMatters}
              </p>
            </PaperCard>

            {/* Scripture */}
            <PaperCard variant="atmospheric" padding="md" className="mt-4">
              {quest.scriptureText && (
                <blockquote className="verse-text text-[1.0625rem]">
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
              <p className="text-[0.75rem] uppercase tracking-wide text-gold-700">
                A prayer to begin
              </p>
              <p className="mt-1.5 text-[1rem] italic text-charcoal">
                “{quest.prayerPrompt}”
              </p>
            </PaperCard>

            <div className="mt-6">
              {alreadyCompletedToday ? (
                <PaperCard variant="quiet" padding="md" className="text-center">
                  <p className="text-[0.9375rem] text-charcoal">
                    You’ve already carried this today. It’s part of your journey.
                  </p>
                  <GentleLink variant="text" href="/app/journey" className="mt-2">
                    See your journey
                  </GentleLink>
                </PaperCard>
              ) : (
                <GentleButton variant="dark" size="lg" fullWidth onClick={begin}>
                  Begin quest
                </GentleButton>
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
            transition={{ duration: 0.3 }}
            className="pb-8"
          >
            <div className="mt-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-olive-50 ring-1 ring-olive-100">
                <PixelIcon name="leaf" size={6} animate />
              </div>
              <h2 className="font-display text-[1.625rem] leading-tight text-graphite">
                A moment to notice
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-[0.9375rem] text-ash">
                When you’ve done this — or if you’d like to reflect first — take a
                breath here. Writing is always optional.
              </p>
            </div>

            <PaperCard variant="paper" padding="md" className="mt-6">
              <p className="text-[0.9375rem] font-medium text-graphite">
                {quest.reflectionPrompt}
              </p>
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                rows={5}
                placeholder="Write freely, or leave this blank…"
                className="mt-3 w-full resize-none rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-3 text-[1rem] leading-relaxed text-graphite outline-none transition-colors focus:border-olive-300"
              />
              <div className="mt-3">
                <MoodPicker value={mood} onChange={setMood} />
              </div>
            </PaperCard>

            <div className="mt-5 space-y-2.5">
              <GentleButton
                variant="dark"
                size="lg"
                fullWidth
                onClick={() => finish(true)}
              >
                <IconCheck size={18} /> Complete quest
              </GentleButton>
              <button
                onClick={() => finish(false)}
                className="w-full py-2 text-center text-[0.9375rem] text-ash transition-colors hover:text-charcoal"
              >
                Complete without writing
              </button>
            </div>
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex min-h-[60vh] flex-col items-center justify-center pb-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
              className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-olive-50 ring-1 ring-olive-100"
            >
              <PixelIcon name={quest.growthType === "flowers" ? "flower" : "leaf"} size={8} animate />
            </motion.div>
            <h2 className="font-display text-[1.75rem] text-graphite">
              {completionLine(hashString(quest.slug))}
            </h2>
            <p className="mt-2 max-w-xs text-[0.9375rem] text-ash">
              Carry this with you today. Your tree grew a little.
            </p>
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
