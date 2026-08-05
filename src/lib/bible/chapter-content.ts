/**
 * The chapter shape shared by the server loader and the client loader.
 *
 * This module deliberately has NO imports. `lib/bible/server.ts` starts with
 * `import "server-only"` and pulls in `node:fs`, so anything that re-exports
 * from it becomes a live client import the moment it is used as a value rather
 * than a type. Keeping the interface in a leaf lets the browser bundle import
 * it freely.
 */
export interface ChapterContent {
  bookSlug: string;
  bookName: string;
  chapter: number;
  chapterCount: number;
  verses: string[];
}

/** The on-disk shape of `src/data/bible/<slug>.json`. */
export interface BookFile {
  slug: string;
  name: string;
  testament: "old" | "new";
  order: number;
  chapters: string[][];
}
