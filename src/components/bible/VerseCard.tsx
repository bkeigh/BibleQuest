"use client";

import { useCallback, useEffect, useState } from "react";
import type { DailyVerse } from "@/lib/questos/types";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import {
  IconBookmark,
  IconBookmarkFilled,
  IconArrowRight,
  IconLeaf,
  IconShare,
  IconSparkle,
} from "@/components/design-system/icons";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { cleanVerseText, formatVerseShareText } from "@/lib/utils/scripture";
import { useStrings } from "@/lib/i18n";
import { VerseShareSheet } from "@/components/bible/VerseShareSheet";
import { ApiBibleViewTracker } from "@/components/bible/ApiBibleViewTracker";
import { usePreferredBiblePassage } from "@/lib/bible/use-preferred-scripture";
import { chapterHref } from "@/lib/bible/links";
import {
  isRedistributableBibleTranslation,
  LOCAL_WEB_TRANSLATION_KEY,
} from "@/lib/bible/translations";
import { buildPublicUrl } from "@/lib/platform/api";

/**
 * VerseCard — today's verse as a devotional card / margin note.
 */
export function VerseCard({
  verse,
  onAnotherVerse,
  anotherVerseLoading = false,
  preview,
  showOpenInChapter = false,
  onPresentedText,
}: {
  verse: DailyVerse;
  /**
   * Optional "Another verse" control in the kicker row. The Bible hub passes
   * the store's refreshVerse so the swap holds steady for the day — a quiet
   * offer of a different word, never a slot machine.
   */
  onAnotherVerse?: () => void;
  /** Prevent refreshes while the current account entitlement is unresolved. */
  anotherVerseLoading?: boolean;
  /**
   * Display-only mode for surfaces OUTSIDE the app shell (onboarding).
   * Hides every action — Save writes to the store mid-setup, and
   * "Reflect on this" navigates into /app, where OnboardingGate bounces
   * an incomplete profile back to /onboarding and restarts the flow.
   * Also tightens type and padding so the step fits a phone screen.
   */
  preview?: boolean;
  /** Give Bible surfaces a direct path from the daily passage into context. */
  showOpenInChapter?: boolean;
  /** Records only wording that BibleQuest may safely persist in history. */
  onPresentedText?: (text: string) => void;
}) {
  const { toast } = useToast();
  const t = useStrings();
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const toggleBookmark = useQuestOS((s) => s.toggleBookmark);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const resolved = usePreferredBiblePassage(verse, !preview);
  const mayPersistEffectiveText = isRedistributableBibleTranslation(
    resolved.effectiveTranslation,
  );
  const persistableText =
    !resolved.loading && mayPersistEffectiveText ? resolved.text : verse.text;

  const closeShareSheet = useCallback(() => setShareSheetOpen(false), []);

  // History should match the edition on screen when that wording is safe to
  // store; licensed editions retain the bundled WEB snapshot instead.
  useEffect(() => {
    if (preview || resolved.loading || !onPresentedText) return;
    onPresentedText(persistableText);
  }, [
    onPresentedText,
    persistableText,
    preview,
    resolved.loading,
  ]);

  const verseSegment =
    verse.verseEnd > verse.verseStart
      ? `${verse.verseStart}-${verse.verseEnd}`
      : `${verse.verseStart}`;
  const shareTitle = `${verse.reference} — BibleQuest`;
  // Open editions can travel with their attribution. API.Bible content stays
  // transient, so licensed readings share the bundled WEB snapshot instead.
  const sharedVerseText = persistableText;
  const shareText = formatVerseShareText(sharedVerseText, verse.reference);
  const sharePath = `/verse/${verse.bookSlug}/${verse.chapter}/${verseSegment}${
    !resolved.loading &&
    mayPersistEffectiveText &&
    resolved.effectiveTranslation.key !== LOCAL_WEB_TRANSLATION_KEY
      ? `?translation=${encodeURIComponent(resolved.effectiveTranslation.key)}`
      : ""
  }`;
  const chapterPath = chapterHref(verse.bookSlug, verse.chapter, {
    verse: verseSegment,
    anchor: verse.verseStart,
  });

  function shareVerse() {
    setShareUrl(buildPublicUrl(sharePath));
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
      b.verse === verse.verseStart &&
      (b.translationKey ?? "web") === resolved.effectiveTranslation.key
  );

  return (
    <PaperCard
      variant="atmospheric"
      padding={preview ? "md" : "sm"}
      className="relative overflow-hidden"
    >
      <div className="pointer-events-none absolute -right-3 -top-2 opacity-30">
        <IconLeaf className="text-olive-300" size={preview ? 64 : 52} />
      </div>
      <div className="flex items-center justify-between gap-1.5 min-[380px]:gap-3">
        <h2
          className={`font-art-label leading-tight uppercase tracking-[0.05em] text-accent ${
            preview
              ? "text-[1.25rem]"
              : "text-[1.0625rem] min-[380px]:text-[1.25rem]"
          }`}
        >
          {t.home.todaysVerse}
        </h2>
        {onAnotherVerse && (
          <GentleButton
            variant="text"
            size="sm"
            onClick={onAnotherVerse}
            disabled={anotherVerseLoading || resolved.loading}
            className="-my-2 min-h-11 shrink-0 text-[0.875rem]"
          >
            <IconSparkle size={15} />
            {resolved.loading
              ? "Preparing…"
              : anotherVerseLoading
                ? "Checking…"
                : t.home.anotherVerse}
          </GentleButton>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {resolved.loading
          ? `Loading ${resolved.preferredTranslation?.name ?? "your preferred Bible edition"} for ${verse.reference}.`
          : `${verse.reference}, ${resolved.effectiveTranslation.name}. ${cleanVerseText(resolved.text)}`}
      </p>
      <div aria-busy={resolved.loading}>
        {resolved.loading ? (
          <div className="mt-2 min-h-[6.25rem] rounded-[10px] bg-linen/45 px-3 py-3">
            <p className="text-caption text-ash">
              Preparing {resolved.preferredTranslation?.name ?? "your preferred edition"}…
            </p>
            <div aria-hidden="true" className="mt-3 space-y-2.5">
              <div className="h-2.5 w-full rounded-full bg-mist/80" />
              <div className="h-2.5 w-[88%] rounded-full bg-mist/70" />
              <div className="h-2.5 w-[62%] rounded-full bg-mist/60" />
            </div>
          </div>
        ) : (
          <div>
            <blockquote
              dir={resolved.effectiveTranslation.direction}
              lang={resolved.effectiveTranslation.languageId}
              className={
                preview
                  ? "verse-text mt-2.5"
                  : "verse-text verse-text-card mt-2"
              }
            >
              “{cleanVerseText(resolved.text)}”
            </blockquote>
            <cite
              className={`block not-italic text-ash ${
                preview
                  ? "mt-2 text-[0.9375rem]"
                  : "mt-1.5 text-[0.8125rem]"
              }`}
            >
              — {verse.reference} <span className="text-fog">·</span>{" "}
              <span
                dir={resolved.effectiveTranslation.direction}
                lang={resolved.effectiveTranslation.languageId}
              >
                {resolved.effectiveTranslation.name}
              </span>
            </cite>
          </div>
        )}
      </div>
      <ApiBibleViewTracker token={resolved.fumsToken} />
      {!preview && (
        <div className="mt-2 flex flex-wrap items-center gap-0.5 min-[380px]:gap-1">
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
                text: mayPersistEffectiveText ? resolved.text : verse.text,
                translationKey: resolved.effectiveTranslation.key,
              });
              toast(nowSaved ? "Saved to your verses." : "Removed from your verses.");
            }}
            disabled={resolved.loading}
          >
            {saved ? (
              <IconBookmarkFilled size={17} className="text-accent" />
            ) : (
              <IconBookmark size={17} />
            )}
            {resolved.loading ? "Loading…" : saved ? "Saved" : "Save"}
          </GentleButton>
          <GentleButton
            variant="ghost"
            size="sm"
            className="min-h-11 max-[360px]:gap-1 max-[360px]:px-1 max-[360px]:text-[0.875rem]"
            onClick={shareVerse}
            aria-haspopup="dialog"
            disabled={resolved.loading}
          >
            <IconShare size={16} />
            {t.home.share}
          </GentleButton>
          {showOpenInChapter && (
            <GentleLink
              variant="ghost"
              size="sm"
              href={chapterPath}
              className="min-h-11 max-[360px]:gap-1 max-[360px]:px-1 max-[360px]:text-[0.875rem]"
            >
              Open chapter
              <IconArrowRight size={14} />
            </GentleLink>
          )}
          <GentleLink
            variant="text"
            href={`/app/prayer/reflection/new?verse=${encodeURIComponent(verse.reference)}`}
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
        notice={
          !resolved.loading &&
          !mayPersistEffectiveText
            ? "The shared wording may differ from what you’re reading so licensed text stays inside BibleQuest."
            : undefined
        }
        onClose={closeShareSheet}
      />
    </PaperCard>
  );
}
