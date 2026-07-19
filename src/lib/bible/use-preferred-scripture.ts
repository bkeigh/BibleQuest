"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuestOS } from "@/lib/questos/store";
import type { DailyVerse } from "@/lib/questos/types";
import type { ChapterContent } from "@/lib/bible/server";
import {
  LOCAL_WEB_TRANSLATION_KEY,
  WEB_TRANSLATION,
  isRedistributableBibleTranslation,
  normalizeBibleTranslationKey,
  translationMetadata,
  type BibleTranslation,
  type ResolvedBiblePassage,
} from "./translations";

type FallbackReason = NonNullable<ResolvedBiblePassage["fallbackReason"]>;

function errorCode(value: unknown): FallbackReason {
  if (
    value === "provider_not_configured" ||
    value === "translation_unavailable" ||
    value === "content_unavailable"
  ) {
    return value;
  }
  return "content_unavailable";
}

function fallbackReason(value: unknown): FallbackReason | undefined {
  return value === "provider_not_configured" ||
    value === "translation_unavailable" ||
    value === "content_unavailable"
    ? value
    : undefined;
}

export interface PreferredPassageResult extends ResolvedBiblePassage {
  loading: boolean;
  preferredTranslation?: BibleTranslation;
  /** A persisted open-edition copy is visible while its online source refreshes. */
  usingStoredSnapshot?: boolean;
}

export function usePreferredBiblePassage(
  passage: DailyVerse,
  enabled = true,
  preferenceOverride?: string,
  snapshotTranslationKey?: string,
): PreferredPassageResult {
  const storedPreference = useQuestOS(
    (state) => state.settings.preferredBibleTranslation,
  );
  const requestedKey = enabled
    ? normalizeBibleTranslationKey(
        preferenceOverride || storedPreference || LOCAL_WEB_TRANSLATION_KEY,
      )
    : LOCAL_WEB_TRANSLATION_KEY;
  const preferredTranslation = translationMetadata(requestedKey);
  const snapshotTranslation = translationMetadata(snapshotTranslationKey);
  const storedSnapshotTranslation =
    snapshotTranslation?.key === requestedKey &&
    isRedistributableBibleTranslation(snapshotTranslation)
      ? snapshotTranslation
      : undefined;
  const fallback = useMemo<PreferredPassageResult>(
    () => ({
      text: passage.text,
      requestedKey,
      effectiveTranslation: storedSnapshotTranslation ?? WEB_TRANSLATION,
      preferredTranslation,
      usingStoredSnapshot: Boolean(storedSnapshotTranslation),
      loading: requestedKey !== LOCAL_WEB_TRANSLATION_KEY,
    }),
    [passage.text, preferredTranslation, requestedKey, storedSnapshotTranslation],
  );
  const requestId = `${requestedKey}:${passage.bookSlug}:${passage.chapter}:${passage.verseStart}:${passage.verseEnd}`;
  const [remote, setRemote] = useState<{
    requestId: string;
    result: PreferredPassageResult;
  } | null>(null);

  useEffect(() => {
    if (requestedKey === LOCAL_WEB_TRANSLATION_KEY) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      translation: requestedKey,
      book: passage.bookSlug,
      chapter: String(passage.chapter),
      start: String(passage.verseStart),
      end: String(passage.verseEnd),
    });

    void fetch(`/api/bible/passage?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          error?: unknown;
          text?: unknown;
          translation?: BibleTranslation;
          fumsToken?: string;
          fallbackReason?: unknown;
          requestedKey?: unknown;
        };
        if (!response.ok || typeof body.text !== "string" || !body.translation) {
          throw body.error;
        }
        setRemote({
          requestId,
          result: {
            text: body.text,
            requestedKey,
            effectiveTranslation: body.translation,
            preferredTranslation:
              preferredTranslation ??
              (body.translation.key === requestedKey
                ? body.translation
                : undefined),
            fallbackReason:
              fallbackReason(body.fallbackReason) ??
              (body.translation.key !== requestedKey
                ? "content_unavailable"
                : undefined),
            fumsToken: body.fumsToken,
            usingStoredSnapshot: false,
            loading: false,
          },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRemote({
          requestId,
          result: {
            ...fallback,
            loading: false,
            fallbackReason: errorCode(error),
          },
        });
      });
    return () => controller.abort();
  }, [
    fallback,
    passage.bookSlug,
    passage.chapter,
    passage.verseEnd,
    passage.verseStart,
    preferredTranslation,
    requestId,
    requestedKey,
  ]);

  return remote?.requestId === requestId ? remote.result : fallback;
}

export interface PreferredChapterResult {
  verses: string[];
  requestedKey: string;
  effectiveTranslation: BibleTranslation;
  preferredTranslation?: BibleTranslation;
  fallbackReason?: FallbackReason;
  fumsToken?: string;
  loading: boolean;
}

export function usePreferredBibleChapter(
  chapter: ChapterContent,
  preferenceOverride?: string,
): PreferredChapterResult {
  const storedPreference = useQuestOS(
    (state) => state.settings.preferredBibleTranslation,
  );
  const requestedKey = normalizeBibleTranslationKey(
    preferenceOverride || storedPreference || LOCAL_WEB_TRANSLATION_KEY,
  );
  const preferredTranslation = translationMetadata(requestedKey);
  const fallback = useMemo<PreferredChapterResult>(
    () => ({
      verses: chapter.verses,
      requestedKey,
      effectiveTranslation: WEB_TRANSLATION,
      preferredTranslation,
      loading: requestedKey !== LOCAL_WEB_TRANSLATION_KEY,
    }),
    [chapter.verses, preferredTranslation, requestedKey],
  );
  const requestId = `${requestedKey}:${chapter.bookSlug}:${chapter.chapter}`;
  const [remote, setRemote] = useState<{
    requestId: string;
    result: PreferredChapterResult;
  } | null>(null);

  useEffect(() => {
    if (requestedKey === LOCAL_WEB_TRANSLATION_KEY) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      translation: requestedKey,
      book: chapter.bookSlug,
      chapter: String(chapter.chapter),
    });
    void fetch(`/api/bible/chapter?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          error?: unknown;
          verses?: unknown;
          translation?: BibleTranslation;
          fumsToken?: string;
          fallbackReason?: unknown;
          requestedKey?: unknown;
        };
        if (
          !response.ok ||
          !Array.isArray(body.verses) ||
          !body.verses.every((verse) => typeof verse === "string") ||
          !body.translation
        ) {
          throw body.error;
        }
        setRemote({
          requestId,
          result: {
            verses: body.verses,
            requestedKey,
            effectiveTranslation: body.translation,
            preferredTranslation:
              preferredTranslation ??
              (body.translation.key === requestedKey
                ? body.translation
                : undefined),
            fallbackReason:
              fallbackReason(body.fallbackReason) ??
              (body.translation.key !== requestedKey
                ? "content_unavailable"
                : undefined),
            fumsToken: body.fumsToken,
            loading: false,
          },
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRemote({
          requestId,
          result: {
            ...fallback,
            loading: false,
            fallbackReason: errorCode(error),
          },
        });
      });
    return () => controller.abort();
  }, [
    chapter.bookSlug,
    chapter.chapter,
    fallback,
    preferredTranslation,
    requestId,
    requestedKey,
  ]);

  return remote?.requestId === requestId ? remote.result : fallback;
}
