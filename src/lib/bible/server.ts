import "server-only";

/**
 * Server-only chapter loader. Reads a single book's JSON from disk and returns
 * just the requested chapter's verses, so a server-rendered page only ever
 * sends the chapter being read — never the whole 4 MB canon.
 *
 * This backs the public `/verse/**` route and `/api/bible/chapter`. The in-app
 * reader uses `lib/bible/client.ts` instead, because the static export bundled
 * into the iOS app has no Node runtime; both loaders return the same shape and
 * must keep the same validation semantics.
 *
 * The book JSON files are kept in the deployment via
 * `outputFileTracingIncludes` in next.config.ts.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getBookMeta } from "./index";
import type { BookFile, ChapterContent } from "./chapter-content";

export type { ChapterContent };

export async function loadChapter(
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

  // Resolve only the metadata-approved slug and prove it stays inside the Bible root.
  const bibleRoot = path.resolve(process.cwd(), "src", "data", "bible");
  const file = path.resolve(bibleRoot, `${meta.slug}.json`);
  if (!file.startsWith(`${bibleRoot}${path.sep}`)) return null;

  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  const data = JSON.parse(raw) as BookFile;
  const verses = data.chapters[chapter - 1];
  if (!verses) return null;

  return {
    bookSlug,
    bookName: meta.name,
    chapter,
    chapterCount: meta.chapterCount,
    verses,
  };
}
