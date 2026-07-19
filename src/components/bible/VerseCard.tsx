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
import { VerseShareSheet } from "@/components/bible/VerseShareSheet";
import { ApiBibleViewTracker } from "@/components/bible/ApiBibleViewTracker";
import { usePreferredBiblePassage } from "@/lib/bible/use-preferred-scripture";
import {
  isRedistributableBibleTranslation,
  LOCAL_WEB_TRANSLATION_KEY,
} from "@/lib/bible/translations";

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
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const resolved = usePreferredBiblePassage(verse, !preview);
  const mayPersistEffectiveText = isRedistributableBibleTranslation(
    resolved.effectiveTranslation,
  );

  const closeShareSheet = useCallback(() => setShareSheetOpen(false), []);

  const verseSegment =
    verse.verseEnd > verse.verseStart
      ? `${verse.verseStart}-${verse.verseEnd}`
      : `${verse.verseStart}`;
  const shareTitle = `${verse.reference} — BibleQuest`;
  // Open editions can travel with their attribution. API.Bible content stays
  // transient, so licensed readings share the bundled WEB snapshot instead.
  const sharedVerseText =
    !resolved.loading && mayPersistEffectiveText ? resolved.text : verse.text;
  const sharedEdition =
    !resolved.loading && mayPersistEffectiveText
      ? resolved.effectiveTranslation.abbreviation
      : "WEB";
  const shareText = `“${cleanVerseText(sharedVerseText)}” — ${verse.reference} (${sharedEdition})`;
  const sharePath = `/verse/${verse.bookSlug}/${verse.chapter}/${verseSegment}${
    !resolved.loading &&
    mayPersistEffectiveText &&
    resolved.effectiveTranslation.key !== LOCAL_WEB_TRANSLATION_KEY
      ? `?translation=${encodeURIComponent(resolved.effectiveTranslation.key)}`
      : ""
  }`;

  function shareVerse() {
    const url = new URL(sharePath, window.location.origin).toString();
    setShareUrl(url);
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
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {resolved.loading
          ? `${verse.reference} is shown in the World English Bible while BibleQuest checks ${resolved.preferredTranslation?.abbreviation ?? "your preferred edition"}.`
          : `${verse.reference}, ${resolved.effectiveTranslation.name}. ${cleanVerseText(resolved.text)}`}
      </p>
      <div aria-busy={resolved.loading}>
        {/* Keyed by verse: a new pick settles in gently instead of snapping. */}
        <motion.div
          key={`${verse.id}:${resolved.effectiveTranslation.key}`}
          variants={riseIn}
          initial="hidden"
          animate="visible"
        >
          <blockquote
            dir={resolved.effectiveTranslation.direction}
            lang={resolved.effectiveTranslation.languageId}
            className={
              preview ? "verse-text mt-2.5" : "verse-text verse-text-lead mt-2.5"
            }
          >
            “{cleanVerseText(resolved.text)}”
          </blockquote>
          <cite
            className={`block text-[0.9375rem] not-italic text-ash ${
              preview ? "mt-2" : "mt-3"
            }`}
          >
            — {verse.reference} <span className="text-fog">·</span>{" "}
            {resolved.loading
              ? `World English Bible · checking ${resolved.preferredTranslation?.abbreviation ?? "preferred edition"}…`
              : (
                  <span
                    dir={resolved.effectiveTranslation.direction}
                    lang={resolved.effectiveTranslation.languageId}
                  >
                    {resolved.effectiveTranslation.name}
                  </span>
                )}
          </cite>
          {!preview &&
            !resolved.loading &&
            resolved.fallbackReason &&
            resolved.requestedKey !== LOCAL_WEB_TRANSLATION_KEY && (
              <p className="mt-1.5 text-caption leading-relaxed text-ash">
                {resolved.preferredTranslation?.abbreviation ?? "Your preferred edition"}{" "}
                preferred · {resolved.effectiveTranslation.abbreviation} shown{" "}
                {resolved.preferredTranslation?.source === "helloao"
                  ? "because the open online edition could not be loaded."
                  : resolved.fallbackReason === "content_unavailable"
                    ? "because the preferred text could not be loaded."
                    : "because its licensed connection is unavailable."}
              </p>
            )}
          {!preview &&
            !resolved.loading &&
            resolved.effectiveTranslation.copyright &&
            resolved.effectiveTranslation.key !== LOCAL_WEB_TRANSLATION_KEY && (
              <p
                className="mt-2 text-caption leading-relaxed text-ash"
                dir={resolved.effectiveTranslation.direction}
                lang={resolved.effectiveTranslation.languageId}
              >
                {resolved.effectiveTranslation.copyright}
                {resolved.effectiveTranslation.licenseUrl && (
                  <>
                    {" "}
                    <a
                      href={resolved.effectiveTranslation.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                      dir="ltr"
                      lang="en"
                      className="underline decoration-fog underline-offset-2 hover:text-charcoal"
                    >
                      Source &amp; license
                    </a>
                  </>
                )}
              </p>
            )}
        </motion.div>
      </div>
      <ApiBibleViewTracker token={resolved.fumsToken} />
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
          >
            <IconShare size={16} />
            {t.home.share}
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
        notice={
          !resolved.loading &&
          !mayPersistEffectiveText
            ? `You’re reading ${resolved.effectiveTranslation.abbreviation}. Sharing uses the public-domain WEB wording so licensed text stays inside BibleQuest.`
            : undefined
        }
        onClose={closeShareSheet}
      />
    </PaperCard>
  );
}
