/**
 * Bible metadata helpers (safe on client — books.json is small metadata only).
 * Full chapter text is loaded server-side; see lib/bible/server.ts.
 */
import booksJson from "@/data/bible/books.json";
import type { BibleBookMeta } from "@/lib/questos/types";

export const bibleBooks = booksJson as BibleBookMeta[];

const bySlug = new Map(bibleBooks.map((b) => [b.slug, b]));

export function getBookMeta(slug: string): BibleBookMeta | undefined {
  return bySlug.get(slug);
}

export const oldTestament = bibleBooks.filter((b) => b.testament === "old");
export const newTestament = bibleBooks.filter((b) => b.testament === "new");

export function bookDisplayName(meta: BibleBookMeta): string {
  return meta.name;
}
