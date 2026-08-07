import {
  type MyShepherdAppAction,
  type MyShepherdDestination,
} from "@/lib/ai/contracts";
import { bibleBooks } from "@/lib/bible";
import { chapterHref } from "@/lib/bible/links";

const APP_DESTINATION_HREFS = {
  home: "/app",
  quests: "/app/quests",
  bible: "/app/bible",
  prayer: "/app/prayer/new",
  reflections: "/app/prayer/reflections",
  journey: "/app/journey",
  games: "/app/games",
  guided: "/app/guided/daily",
  pilgrimages: "/app/pilgrimages",
  rhythm: "/app/rhythm",
  settings: "/app/settings",
} as const satisfies Record<MyShepherdDestination, string>;

const BOOK_ALIASES = new Map([
  ["psalm", "psalms"],
  ["song of songs", "song-of-solomon"],
  ["canticles", "song-of-solomon"],
  ["revelations", "revelation"],
]);

/** Converts a structured model action into one audited internal route. */
export function myShepherdActionHref(
  action: MyShepherdAppAction,
): string {
  return APP_DESTINATION_HREFS[action.destination];
}

/** Normalizes common book-name punctuation without accepting arbitrary paths. */
function normalizeBookName(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[.']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolves a canonical Bible reference to an exact local chapter or verse. */
export function myShepherdReferenceHref(
  reference: string,
): string | null {
  const match =
    /^(.+?)\s+(\d{1,3})(?::(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?$/.exec(
      reference.trim(),
    );
  if (!match) return null;

  const normalizedName = normalizeBookName(match[1]);
  const aliasSlug = BOOK_ALIASES.get(normalizedName);
  const book =
    bibleBooks.find(
      (candidate) =>
        normalizeBookName(candidate.name) === normalizedName,
    ) ??
    bibleBooks.find((candidate) => candidate.slug === aliasSlug);
  if (!book) return null;

  const chapter = Number(match[2]);
  const verseStart = match[3] ? Number(match[3]) : null;
  const verseEnd = match[4] ? Number(match[4]) : verseStart;
  if (
    chapter < 1 ||
    chapter > book.chapterCount ||
    (verseStart !== null &&
      (verseStart < 1 ||
        verseEnd === null ||
        verseEnd < verseStart ||
        verseEnd > book.verseCounts[chapter - 1]))
  ) {
    return null;
  }

  if (verseStart === null || verseEnd === null) {
    return chapterHref(book.slug, chapter);
  }
  const verseSegment =
    verseEnd > verseStart
      ? `${verseStart}-${verseEnd}`
      : String(verseStart);
  return chapterHref(book.slug, chapter, {
    verse: verseSegment,
    anchor: verseStart,
  });
}
