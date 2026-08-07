"use client";

/**
 * One catalogue row. Collapsed it is a 64px line; open it expands in place.
 *
 * The board keeps `QuestBoardCard` and the shelves keep `QuestSlip`; this is
 * only for the hundred-and-fifty-quest library, where a full card was costing
 * an average of 328px and leaving the text column at 141px of a 335px card —
 * 42% — because an 80px sprite and two stacked 44px buttons ate the rest. A
 * row spends the same width on ~203px of title.
 *
 * Expanding rather than navigating is deliberate for a browse surface: the
 * decision is "is this the one", and the full quest is still one tap away
 * inside the panel.
 */
import { useId } from "react";
import Link from "next/link";
import type { DailyQuestStatus, QuestTemplate } from "@/lib/questos/types";
import { track } from "@/lib/analytics/events";
import { useStrings } from "@/lib/i18n";
import { cn } from "@/lib/utils/cn";
import { ArtIcon, CATEGORY_ART } from "@/components/design-system/ArtIcon";
import {
  IconBookmark,
  IconCheck,
  IconClock,
  IconPlus,
} from "@/components/design-system/icons";
import { CATEGORY_LABEL, formatDuration } from "./QuestSlip";

export function QuestRow({
  quest,
  open,
  onOpenChange,
  assignmentStatus,
  completed,
  saved,
  onAdd,
  onSave,
}: {
  quest: QuestTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentStatus?: DailyQuestStatus;
  completed?: boolean;
  saved?: boolean;
  onAdd?: () => void;
  onSave?: () => void;
}) {
  const t = useStrings();
  const contentId = useId();

  function toggle() {
    if (!open) track("quest_card_expanded", { category: quest.category });
    onOpenChange(!open);
  }

  // Not a list item. The catalogue sheet places the <li> and the divider.
  return (
    <div data-quest-row={quest.slug} className="relative scroll-mt-24">
      <div className="flex items-center gap-3 ps-3 pe-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={toggle}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          {/* Fixed 44px slot. ART_VISUAL_WEIGHT scales some sprites to 1.25,
              which renders up to 50px — a taller child does not grow a fixed
              flex slot, so the row pitch stays constant across categories. */}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <ArtIcon
              name={CATEGORY_ART[quest.category] ?? "leaf"}
              size={40}
            />
          </span>
          <span className="min-w-0 flex-1">
            {/* No line-clamp: at the large text size a clamp hides the tail of
                longer titles, and a row growing to two lines is the honest
                trade against silently truncating the thing being chosen. */}
            <span className="block font-display text-[1.0625rem] leading-[1.28] text-graphite">
              {quest.title}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.8125rem] text-ash">
              <IconClock size={12} />
              {formatDuration(quest.durationMinutes)}
              <span className="text-mist">·</span>
              <span className="font-art-label text-accent">
                {CATEGORY_LABEL[quest.category]}
              </span>
              {completed ? (
                <span className="art-frame ms-auto inline-flex items-center gap-1 bg-accent-surface px-2 py-0.5 text-caption text-accent-ink">
                  <IconCheck size={12} /> Done
                </span>
              ) : assignmentStatus === "started" ? (
                <span className="art-frame ms-auto inline-flex items-center bg-accent-surface px-2 py-0.5 text-caption text-accent-ink">
                  In progress
                </span>
              ) : assignmentStatus === "assigned" ? (
                <span className="art-frame ms-auto inline-flex items-center bg-accent-surface px-2 py-0.5 text-caption text-accent-ink">
                  Ready
                </span>
              ) : saved ? (
                <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-linen px-2 py-0.5 text-caption text-ash ring-1 ring-mist">
                  <IconBookmark size={12} /> Saved
                </span>
              ) : null}
            </span>
          </span>
        </button>

        {/* Always 44px so adding a quest cannot shift the row geometry. */}
        {onAdd ? (
          <button
            type="button"
            aria-label={`Add ${quest.title} to Ready`}
            title="Add to Ready"
            onClick={onAdd}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-paper text-accent transition-colors duration-300 hover:bg-accent-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconPlus size={17} />
          </button>
        ) : (
          <span aria-hidden="true" className="h-11 w-11 shrink-0" />
        )}
      </div>

      {/* minmax(0,1fr) rather than a bare 1fr: Safari retains a stale
          intrinsic row height without the explicit minimum, and this is a long
          list inside a WKWebView. Same note as QuestBoardSection. */}
      <div
        id={contentId}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-gentle)]",
          open ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[minmax(0,0fr)]",
        )}
      >
        <div inert={!open} className="min-h-0 overflow-hidden">
          {/* ps-[4.25rem] = 12 (ps-3) + 44 (sprite) + 12 (gap), so the body
              hangs under the title rather than under the artwork. */}
          <div className="space-y-3 pb-4 pe-3 ps-[4.25rem]">
            <p className="text-small leading-relaxed text-charcoal">
              {quest.invitation}
            </p>
            <p className="text-caption italic text-ash">
              {quest.scriptureReference}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/app/quests/${quest.slug}`}
                className="inline-flex min-h-11 items-center text-small text-accent underline-offset-4 hover:underline"
              >
                View full quest
              </Link>
              {onSave && (
                <button
                  type="button"
                  onClick={onSave}
                  className="inline-flex min-h-11 items-center gap-1.5 text-small text-ash transition-colors hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <IconBookmark size={15} /> {t.myQuests.saveForLater}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
