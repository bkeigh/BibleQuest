import "server-only";

import {
  ApiBibleError,
  fetchApiBibleChapter,
  fetchApiBiblePassage,
} from "./api-bible";
import {
  HelloAoError,
  fetchHelloAoChapter,
  fetchHelloAoPassage,
  isHelloAoTranslationKey,
} from "./helloao";
import {
  bibleTranslationKey,
  featuredTranslation,
  type BibleTranslation,
  type ResolvedBiblePassage,
} from "./translations";

export type BibleProviderErrorCode = NonNullable<
  ResolvedBiblePassage["fallbackReason"]
>;

interface DispatchedChapter {
  translation: BibleTranslation;
  verses: Map<number, string>;
  requestedKey: string;
  fallbackReason?: BibleProviderErrorCode;
  fumsToken?: string;
}

interface DispatchedPassage {
  translation: BibleTranslation;
  text: string;
  requestedKey: string;
  fallbackReason?: BibleProviderErrorCode;
  fumsToken?: string;
}

export function bibleProviderErrorCode(
  error: unknown,
): BibleProviderErrorCode {
  if (error instanceof ApiBibleError || error instanceof HelloAoError) {
    return error.code;
  }
  return "content_unavailable";
}

function isApiBiblePreference(key: string): boolean {
  if (bibleTranslationKey(key) !== key) return false;
  if (key.startsWith("api:")) return true;
  return featuredTranslation(key)?.source === "api_bible";
}

function invalidTranslation(): ApiBibleError {
  return new ApiBibleError(
    "translation_unavailable",
    "That translation is not enabled for BibleQuest.",
  );
}

/**
 * Provider editions can place verses differently from bundled WEB (Romans 16
 * is the common example). Serialize against the validated provider map so no
 * legitimate provider verse is truncated or a local verse count mislabeled.
 */
export function serializeBibleProviderChapter(
  verses: ReadonlyMap<number, string>,
): string[] {
  const numbers = [...verses.keys()];
  if (
    !numbers.length ||
    numbers.some(
      (number) =>
        !Number.isInteger(number) || number < 1 || number > 500,
    )
  ) {
    throw new ApiBibleError(
      "content_unavailable",
      "The provider returned invalid verse numbering.",
    );
  }
  const lastVerse = Math.max(...numbers);
  return Array.from(
    { length: lastVerse },
    (_, index) => verses.get(index + 1)?.trim() ?? "",
  );
}

function shouldUseOpenFallback(error: unknown): error is ApiBibleError {
  // BSB is the online resilience layer for every licensed-provider failure;
  // the bundled WEB remains the final client-side fallback if BSB also fails.
  return error instanceof ApiBibleError;
}

async function withOpenChapterFallback(
  requestedKey: string,
  bookId: string,
  chapter: number,
  originalError: ApiBibleError,
): Promise<DispatchedChapter> {
  try {
    const fallback = await fetchHelloAoChapter("bsb", bookId, chapter);
    return {
      ...fallback,
      requestedKey,
      fallbackReason: originalError.code,
    };
  } catch {
    // Preserve the reason the preferred edition failed. The client can now
    // make its existing, transparent fallback to the bundled WEB text.
    throw originalError;
  }
}

async function withOpenPassageFallback(
  requestedKey: string,
  bookId: string,
  chapter: number,
  start: number,
  end: number,
  originalError: ApiBibleError,
): Promise<DispatchedPassage> {
  try {
    const fallback = await fetchHelloAoPassage(
      "bsb",
      bookId,
      chapter,
      start,
      end,
    );
    return {
      ...fallback,
      requestedKey,
      fallbackReason: originalError.code,
    };
  } catch {
    throw originalError;
  }
}

export async function fetchBibleProviderChapter(
  translationKey: string,
  bookId: string,
  chapter: number,
): Promise<DispatchedChapter> {
  if (isHelloAoTranslationKey(translationKey)) {
    const result = await fetchHelloAoChapter(translationKey, bookId, chapter);
    return { ...result, requestedKey: translationKey };
  }
  if (!isApiBiblePreference(translationKey)) throw invalidTranslation();

  try {
    const result = await fetchApiBibleChapter(
      translationKey,
      bookId,
      chapter,
    );
    return { ...result, requestedKey: translationKey };
  } catch (error) {
    if (shouldUseOpenFallback(error)) {
      return withOpenChapterFallback(
        translationKey,
        bookId,
        chapter,
        error,
      );
    }
    throw error;
  }
}

export async function fetchBibleProviderPassage(
  translationKey: string,
  bookId: string,
  chapter: number,
  start: number,
  end: number,
): Promise<DispatchedPassage> {
  if (isHelloAoTranslationKey(translationKey)) {
    const result = await fetchHelloAoPassage(
      translationKey,
      bookId,
      chapter,
      start,
      end,
    );
    return { ...result, requestedKey: translationKey };
  }
  if (!isApiBiblePreference(translationKey)) throw invalidTranslation();

  try {
    const result = await fetchApiBiblePassage(
      translationKey,
      bookId,
      chapter,
      start,
      end,
    );
    return { ...result, requestedKey: translationKey };
  } catch (error) {
    if (shouldUseOpenFallback(error)) {
      return withOpenPassageFallback(
        translationKey,
        bookId,
        chapter,
        start,
        end,
        error,
      );
    }
    throw error;
  }
}
