import "server-only";

/**
 * Server-only chapter loader. Reads a single book's JSON from disk and returns
 * just the requested chapter's verses, so the client only ever receives the
 * chapter it's reading — never the whole 4 MB canon.
 *
 * The book JSON files are kept in the deployment via
 * `outputFileTracingIncludes` in next.config.ts.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getBookMeta } from "./index";

interface BookFile {
  slug: string;
  name: string;
  testament: "old" | "new";
  order: number;
  chapters: string[][];
}

export interface ChapterContent {
  bookSlug: string;
  bookName: string;
  chapter: number;
  chapterCount: number;
  verses: string[];
}

export async function loadChapter(
  bookSlug: string,
  chapter: number
): Promise<ChapterContent | null> {
  const meta = getBookMeta(bookSlug);
  if (!meta) return null;
  if (chapter < 1 || chapter > meta.chapterCount) return null;

  const file = path.join(process.cwd(), "src", "data", "bible", `${bookSlug}.json`);
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
