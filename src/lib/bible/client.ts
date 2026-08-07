"use client";

/**
 * Client-side chapter loader — the counterpart to `lib/bible/server.ts`.
 *
 * The static export that ships inside the iOS app has no Node runtime, so the
 * chapter text cannot be read from disk at request time. Each book is instead a
 * lazy `import()`, which the bundler turns into its own content-hashed chunk
 * under `_next/static/chunks/`. That means the browser downloads exactly the
 * one book being read (largest is Jeremiah at ~217 KB, ~64 KB gzipped), the
 * service worker already caches those chunks as immutable static assets, and
 * nothing needs to move out of `src/data/bible/`.
 *
 * The map below is written out literally rather than built from a template
 * literal, because a dynamic `import(\`@/data/bible/${slug}.json\`)` makes the
 * bundler emit a context module containing the whole 4 MB canon.
 *
 * Chapters are per-book, not per-chapter, on purpose: prev/next navigation
 * never leaves the book, so one parse serves a whole reading session.
 */
import { getBookMeta } from "./index";
import type { ChapterContent } from "./chapter-content";

/**
 * Only the verse text is needed here. Typing the import against the full
 * `BookFile` would fail: TypeScript widens `testament` to `string` when it
 * derives a module type from JSON, which does not satisfy `"old" | "new"`.
 * Book identity comes from books.json via `getBookMeta` anyway.
 */
type BookChapters = { chapters: string[][] };
type BookLoader = () => Promise<{ default: BookChapters }>;

const BOOKS: Record<string, BookLoader> = {
  "genesis": () => import("@/data/bible/genesis.json"),
  "exodus": () => import("@/data/bible/exodus.json"),
  "leviticus": () => import("@/data/bible/leviticus.json"),
  "numbers": () => import("@/data/bible/numbers.json"),
  "deuteronomy": () => import("@/data/bible/deuteronomy.json"),
  "joshua": () => import("@/data/bible/joshua.json"),
  "judges": () => import("@/data/bible/judges.json"),
  "ruth": () => import("@/data/bible/ruth.json"),
  "1-samuel": () => import("@/data/bible/1-samuel.json"),
  "2-samuel": () => import("@/data/bible/2-samuel.json"),
  "1-kings": () => import("@/data/bible/1-kings.json"),
  "2-kings": () => import("@/data/bible/2-kings.json"),
  "1-chronicles": () => import("@/data/bible/1-chronicles.json"),
  "2-chronicles": () => import("@/data/bible/2-chronicles.json"),
  "ezra": () => import("@/data/bible/ezra.json"),
  "nehemiah": () => import("@/data/bible/nehemiah.json"),
  "esther": () => import("@/data/bible/esther.json"),
  "job": () => import("@/data/bible/job.json"),
  "psalms": () => import("@/data/bible/psalms.json"),
  "proverbs": () => import("@/data/bible/proverbs.json"),
  "ecclesiastes": () => import("@/data/bible/ecclesiastes.json"),
  "song-of-solomon": () => import("@/data/bible/song-of-solomon.json"),
  "isaiah": () => import("@/data/bible/isaiah.json"),
  "jeremiah": () => import("@/data/bible/jeremiah.json"),
  "lamentations": () => import("@/data/bible/lamentations.json"),
  "ezekiel": () => import("@/data/bible/ezekiel.json"),
  "daniel": () => import("@/data/bible/daniel.json"),
  "hosea": () => import("@/data/bible/hosea.json"),
  "joel": () => import("@/data/bible/joel.json"),
  "amos": () => import("@/data/bible/amos.json"),
  "obadiah": () => import("@/data/bible/obadiah.json"),
  "jonah": () => import("@/data/bible/jonah.json"),
  "micah": () => import("@/data/bible/micah.json"),
  "nahum": () => import("@/data/bible/nahum.json"),
  "habakkuk": () => import("@/data/bible/habakkuk.json"),
  "zephaniah": () => import("@/data/bible/zephaniah.json"),
  "haggai": () => import("@/data/bible/haggai.json"),
  "zechariah": () => import("@/data/bible/zechariah.json"),
  "malachi": () => import("@/data/bible/malachi.json"),
  "matthew": () => import("@/data/bible/matthew.json"),
  "mark": () => import("@/data/bible/mark.json"),
  "luke": () => import("@/data/bible/luke.json"),
  "john": () => import("@/data/bible/john.json"),
  "acts": () => import("@/data/bible/acts.json"),
  "romans": () => import("@/data/bible/romans.json"),
  "1-corinthians": () => import("@/data/bible/1-corinthians.json"),
  "2-corinthians": () => import("@/data/bible/2-corinthians.json"),
  "galatians": () => import("@/data/bible/galatians.json"),
  "ephesians": () => import("@/data/bible/ephesians.json"),
  "philippians": () => import("@/data/bible/philippians.json"),
  "colossians": () => import("@/data/bible/colossians.json"),
  "1-thessalonians": () => import("@/data/bible/1-thessalonians.json"),
  "2-thessalonians": () => import("@/data/bible/2-thessalonians.json"),
  "1-timothy": () => import("@/data/bible/1-timothy.json"),
  "2-timothy": () => import("@/data/bible/2-timothy.json"),
  "titus": () => import("@/data/bible/titus.json"),
  "philemon": () => import("@/data/bible/philemon.json"),
  "hebrews": () => import("@/data/bible/hebrews.json"),
  "james": () => import("@/data/bible/james.json"),
  "1-peter": () => import("@/data/bible/1-peter.json"),
  "2-peter": () => import("@/data/bible/2-peter.json"),
  "1-john": () => import("@/data/bible/1-john.json"),
  "2-john": () => import("@/data/bible/2-john.json"),
  "3-john": () => import("@/data/bible/3-john.json"),
  "jude": () => import("@/data/bible/jude.json"),
  "revelation": () => import("@/data/bible/revelation.json"),
};

/**
 * Parsed books, capped so a long reading session cannot pin the whole canon in
 * memory. Insertion order is the eviction order, which matches how people read.
 */
const MAX_CACHED_BOOKS = 3;
const cache = new Map<string, string[][]>();

function remember(slug: string, chapters: string[][]): void {
  cache.delete(slug);
  cache.set(slug, chapters);
  while (cache.size > MAX_CACHED_BOOKS) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * Mirrors `loadChapter` in lib/bible/server.ts exactly, including returning the
 * caller's `bookSlug` rather than the metadata slug — callers persist that value
 * into reading position and bookmarks, so the two loaders must not disagree.
 */
export async function loadChapterClient(
  bookSlug: string,
  chapter: number,
): Promise<ChapterContent | null> {
  const meta = getBookMeta(bookSlug);
  if (!meta) return null;
  if (
    !Number.isSafeInteger(chapter) ||
    chapter < 1 ||
    chapter > meta.chapterCount
  ) {
    return null;
  }

  let chapters = cache.get(meta.slug);
  if (!chapters) {
    const load = BOOKS[meta.slug];
    if (!load) return null;
    try {
      chapters = (await load()).default.chapters;
    } catch {
      // A failed chunk fetch is offline-on-web or a corrupt bundle on native.
      return null;
    }
    remember(meta.slug, chapters);
  }

  const verses = chapters[chapter - 1];
  if (!verses) return null;

  return {
    bookSlug,
    bookName: meta.name,
    chapter,
    chapterCount: meta.chapterCount,
    verses,
  };
}
