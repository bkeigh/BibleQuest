"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import type { DailyVerse } from "@/lib/questos/types";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconLeaf,
  IconShare,
  IconSparkle,
} from "@/components/design-system/icons";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { cleanVerseText } from "@/lib/utils/scripture";
import { useStrings } from "@/lib/i18n";
import { riseIn } from "@/lib/motion";
import { track } from "@/lib/analytics/events";
import { VerseShareSheet } from "@/components/bible/VerseShareSheet";

/**
 * VerseCard — today's verse as a devotional card / margin note.
 */
export function VerseCard({
  verse,
  onAnotherVerse,
  preview,
}: {
  verse: DailyVerse;
  /**
   * Optional "Another verse" control in the kicker row. Home passes the
   * store's refreshVerse so the swap holds steady for the day — a quiet
   * offer of a different word, never a slot machine.
   */
  onAnotherVerse?: () => void;
  /**
   * Display-only mode for surfaces OUTSIDE the app shell (onboarding).
   * Hides every action — Save writes to the store mid-setup, and
   * "Reflect on this" navigates into /app, where OnboardingGate bounces
   * an incomplete profile back to /onboarding and restarts the flow.
   * Also tightens type and padding so the step fits a phone screen.
   */
  preview?: boolean;
}) {
  const { toast } = useToast();
  const t = useStrings();
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const toggleBookmark = useQuestOS((s) => s.toggleBookmark);
  const [sharing, setSharing] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const closeShareSheet = useCallback(() => setShareSheetOpen(false), []);

  const verseSegment =
    verse.verseEnd > verse.verseStart
      ? `${verse.verseStart}-${verse.verseEnd}`
      : `${verse.verseStart}`;
  const shareTitle = `${verse.reference} — BibleQuest`;
  const shareText = `“${cleanVerseText(verse.text)}” — ${verse.reference}`;
  const sharePath = `/verse/${verse.bookSlug}/${verse.chapter}/${verseSegment}`;

  async function shareVerse() {
    if (sharing) return;
    const url = new URL(sharePath, window.location.origin).toString();
    setShareUrl(url);
    setSharing(true);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url,
        });
        track("verse_shared");
        return;
      } catch (err) {
        // Dismissing the share sheet is a choice, not a failure — and not
        // an event. Anything else (webview stubs, permissions policy) falls
        // through to the clipboard so the button never dies silently.
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setSharing(false);
      }
    } else {
      setSharing(false);
    }
    setShareSheetOpen(true);
  }

  const bookName =
    verse.bookSlug === "psalms"
      ? "Psalms"
      : verse.reference.replace(/\s+\d+:.*$/, "");

  const saved = bookmarks.some(
    (b) =>
      b.bookSlug === verse.bookSlug &&
      b.chapter === verse.chapter &&
      b.verse === verse.verseStart
  );

  return (
    <PaperCard
      variant="atmospheric"
      padding="md"
      className="relative overflow-hidden"
    >
      <div className="pointer-events-none absolute -right-3 -top-2 opacity-30">
        <IconLeaf className="text-olive-300" size={64} />
      </div>
      <div className="flex items-center justify-between gap-1.5 min-[380px]:gap-3">
        <h2
          className={`font-pixel leading-tight uppercase tracking-[0.05em] text-accent ${
            preview
              ? "text-[1.25rem]"
              : "text-[1.125rem] min-[380px]:text-[1.5rem]"
          }`}
        >
          {t.home.todaysVerse}
        </h2>
        {onAnotherVerse && (
          <GentleButton
            variant="text"
            size="sm"
            onClick={onAnotherVerse}
            className="-my-2 min-h-11 shrink-0"
          >
            <IconSparkle size={15} />
            {t.home.anotherVerse}
          </GentleButton>
        )}
      </div>
      {/* Stable aria-live wrapper: "Another verse" swaps the content, and
          screen readers should hear the new verse without refocusing. */}
      <div aria-live="polite">
        {/* Keyed by verse: a new pick settles in gently instead of snapping. */}
        <motion.div
          key={verse.id}
          variants={riseIn}
          initial="hidden"
          animate="visible"
        >
          <blockquote
            className={
              preview ? "verse-text mt-2.5" : "verse-text verse-text-lead mt-2.5"
            }
          >
            “{cleanVerseText(verse.text)}”
          </blockquote>
          <cite
            className={`block text-[0.9375rem] not-italic text-ash ${
              preview ? "mt-2" : "mt-3"
            }`}
          >
            — {verse.reference} <span className="text-fog">·</span> World English Bible
          </cite>
        </motion.div>
      </div>
      {!preview && (
        <div className="mt-3 flex flex-wrap items-center gap-1 min-[380px]:mt-4 min-[380px]:gap-2">
          <GentleButton
            variant="ghost"
            size="sm"
            className="min-h-11 max-[360px]:gap-1 max-[360px]:px-1 max-[360px]:text-[0.875rem]"
            onClick={() => {
              const nowSaved = toggleBookmark({
                bookSlug: verse.bookSlug,
                bookName,
                chapter: verse.chapter,
                verse: verse.verseStart,
                text: verse.text,
              });
              toast(nowSaved ? "Saved to your verses." : "Removed from your verses.");
            }}
          >
            {saved ? (
              <IconBookmarkFilled size={17} className="text-accent" />
            ) : (
              <IconBookmark size={17} />
            )}
            {saved ? "Saved" : "Save"}
          </GentleButton>
          <GentleButton
            variant="ghost"
            size="sm"
            className="min-h-11 max-[360px]:gap-1 max-[360px]:px-1 max-[360px]:text-[0.875rem]"
            onClick={shareVerse}
            disabled={sharing}
            aria-busy={sharing}
            aria-haspopup="dialog"
          >
            <IconShare size={16} />
            {sharing ? "Sharing…" : t.home.share}
          </GentleButton>
          <GentleLink
            variant="text"
            href={`/app/reflection/new?verse=${encodeURIComponent(verse.reference)}`}
            className="min-h-11 max-[360px]:text-[0.875rem]"
          >
            Reflect on this
          </GentleLink>
        </div>
      )}
      <VerseShareSheet
        open={shareSheetOpen}
        title={shareTitle}
        text={shareText}
        url={shareUrl || sharePath}
        onClose={closeShareSheet}
      />
    </PaperCard>
  );
}
