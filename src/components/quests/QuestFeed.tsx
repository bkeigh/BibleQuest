"use client";

/**
 * QuestFeed — the Home shelf: every quest the user is walking, holding for
 * later, or has finished, each with its own place and pace.
 *
 * Today's picks stay in the "Today's quests" section above; this feed
 * carries everything beyond the day — active walks from other days, saved
 * and paused quests, and a collapsed record of completed and archived ones.
 * The section renders nothing at all when the shelf holds nothing beyond
 * today, so an empty feed never crowds the page with a second empty state.
 *
 * One card expands at a time — calm, not a wall of open drawers.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { MyQuest } from "@/lib/questos/types";
import {
  useQuestOS,
  selectMyQuests,
  selectTodayPicks,
} from "@/lib/questos/store";
import { buildQuestFeed } from "@/lib/questos/quest-feed";
import { questBySlug } from "@/data/seed/quests";
import { Disclosure } from "@/components/design-system/Disclosure";
import { QuestAccordionCard } from "./QuestAccordionCard";
import { useStrings } from "@/lib/i18n";

function resolve(entries: MyQuest[]) {
  return entries.flatMap((entry) => {
    const quest = questBySlug.get(entry.questSlug);
    return quest ? [{ entry, quest }] : [];
  });
}

export function QuestFeed() {
  const t = useStrings();
  const myQuests = useQuestOS(selectMyQuests);
  const picks = useQuestOS(selectTodayPicks);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  // When a card action unmounts or relocates the focused card (remove,
  // archive, pause, reopen), keyboard focus lands on the section heading
  // instead of dropping to <body>.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useCallback(() => {
    headingRef.current?.focus();
  }, []);

  const sections = useMemo(
    () => buildQuestFeed(myQuests, picks),
    [myQuests, picks]
  );
  const todaySlugs = useMemo(
    () => new Set(picks.map((p) => p.questSlug)),
    [picks]
  );

  // Today's picks already live in the "Today's quests" section above —
  // repeating them here would read as clutter, not care.
  const journey = useMemo(
    () =>
      resolve(sections.journey.filter((q) => !todaySlugs.has(q.questSlug))),
    [sections.journey, todaySlugs]
  );
  const saved = useMemo(() => resolve(sections.saved), [sections.saved]);
  const completed = useMemo(
    () => resolve(sections.completed),
    [sections.completed]
  );
  const archived = useMemo(
    () => resolve(sections.archived),
    [sections.archived]
  );

  if (
    journey.length === 0 &&
    saved.length === 0 &&
    completed.length === 0 &&
    archived.length === 0
  ) {
    return null;
  }

  const cardProps = (slug: string) => ({
    open: expandedSlug === slug,
    onOpenChange: (open: boolean) => setExpandedSlug(open ? slug : null),
    onRelocate: restoreFocus,
  });

  return (
    <section aria-label={t.myQuests.title} className="pt-1">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mb-2.5 font-pixel text-[1.5rem] leading-tight uppercase tracking-[0.05em] text-accent outline-none"
      >
        {t.myQuests.title}
      </h2>

      <div className="space-y-4">
        {journey.length > 0 && (
          <div>
            <p className="mb-2 text-caption uppercase tracking-[0.16em] text-ash">
              {t.myQuests.continueTitle}
            </p>
            <ul className="space-y-3">
              {journey.map(({ entry, quest }) => (
                <QuestAccordionCard
                  key={quest.slug}
                  quest={quest}
                  entry={entry}
                  {...cardProps(quest.slug)}
                />
              ))}
            </ul>
          </div>
        )}

        {saved.length > 0 && (
          <div>
            <p className="mb-2 text-caption uppercase tracking-[0.16em] text-ash">
              {t.myQuests.savedTitle}
            </p>
            <ul className="space-y-3">
              {saved.map(({ entry, quest }) => (
                <QuestAccordionCard
                  key={quest.slug}
                  quest={quest}
                  entry={entry}
                  {...cardProps(quest.slug)}
                />
              ))}
            </ul>
          </div>
        )}

        {(completed.length > 0 || archived.length > 0) && (
          <Disclosure
            variant="quiet"
            label={t.myQuests.completedTitle}
            count={completed.length + archived.length}
          >
            <ul className="space-y-3">
              {completed.map(({ entry, quest }) => (
                <QuestAccordionCard
                  key={quest.slug}
                  quest={quest}
                  entry={entry}
                  {...cardProps(quest.slug)}
                />
              ))}
            </ul>
            {archived.length > 0 && (
              <div className={completed.length > 0 ? "mt-4" : undefined}>
                <p className="mb-2 text-caption uppercase tracking-[0.16em] text-ash">
                  {t.myQuests.archivedTitle}
                </p>
                <ul className="space-y-3">
                  {archived.map(({ entry, quest }) => (
                    <QuestAccordionCard
                      key={quest.slug}
                      quest={quest}
                      entry={entry}
                      {...cardProps(quest.slug)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </Disclosure>
        )}
      </div>
    </section>
  );
}
