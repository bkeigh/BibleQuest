import "server-only";

import { loadChapter } from "./server";
import { fetchHelloAoPassage } from "./helloao";
import { providerBookId } from "./provider-books";
import {
  WEB_TRANSLATION,
  translationMetadata,
  type BibleTranslation,
} from "./translations";
import { cleanVerseText } from "@/lib/utils/scripture";

export interface SharedVerse {
  bookSlug: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  verseSegment: string;
  reference: string;
  text: string;
  translation: BibleTranslation;
}

const MAX_SHARED_VERSE_NUMBER = 200;

// Accepts a bounded single verse or short range before any provider request.
function parseVerseSegment(
  segment: string,
  verseCount: number,
): { start: number; end: number } | null {
  const match = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(segment);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start ||
    end > verseCount ||
    end - start > 11
  ) {
    return null;
  }
  return { start, end };
}

// Resolves public share URLs against local WEB first and an explicitly
// requested open provider edition second.
export async function resolveSharedVerse(
  bookSlug: string,
  chapterValue: string,
  verseValue: string,
  translationKey: string,
): Promise<SharedVerse | null> {
  const chapter = Number(chapterValue);
  if (!Number.isInteger(chapter)) return null;
  const content = await loadChapter(bookSlug, chapter);
  if (!content) return null;
  // Provider editions can contain a different canonical verse count. Parse
  // against a hard public bound first, then validate against the edition that
  // actually supplies the wording below.
  const range = parseVerseSegment(verseValue, MAX_SHARED_VERSE_NUMBER);
  if (!range) return null;

  const verseSegment =
    range.end > range.start ? `${range.start}-${range.end}` : `${range.start}`;
  const reference = `${content.bookName} ${chapter}:${range.start}${
    range.end > range.start ? `–${range.end}` : ""
  }`;
  const hasWebRange = range.end <= content.verses.length;
  let text = hasWebRange
    ? cleanVerseText(
        content.verses.slice(range.start - 1, range.end).join(" "),
      )
    : "";
  let translation = WEB_TRANSLATION;
  const requestedTranslation = translationMetadata(translationKey);
  const bookId = providerBookId(bookSlug);
  if (
    requestedTranslation?.source === "helloao" &&
    requestedTranslation.availability === "open" &&
    bookId &&
    range.end - range.start <= 7
  ) {
    try {
      const open = await fetchHelloAoPassage(
        requestedTranslation.key,
        bookId,
        chapter,
        range.start,
        range.end,
      );
      text = cleanVerseText(open.text);
      translation = open.translation;
    } catch {
      // A range present in WEB can fall back honestly during an outage; a
      // provider-only range cannot be represented and therefore returns 404.
    }
  }

  if (!text) return null;
  return {
    bookSlug,
    bookName: content.bookName,
    chapter,
    verseStart: range.start,
    verseEnd: range.end,
    verseSegment,
    reference,
    text,
    translation,
  };
}
