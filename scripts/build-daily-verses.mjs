/** Build the daily rotation entirely from checked-in local WEB files. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DAILY_VERSE_REFS } from "./content/daily-verse-manifest.mjs";

const root = process.cwd();
const bibleDir = path.join(root, "src/data/bible");
const books = JSON.parse(readFileSync(path.join(bibleDir, "books.json"), "utf8"));
const bySlug = new Map(
  books.map((meta) => [
    meta.slug,
    JSON.parse(readFileSync(path.join(bibleDir, `${meta.slug}.json`), "utf8")),
  ]),
);

const keys = new Set();
const pool = DAILY_VERSE_REFS.map(([slug, chapter, start, end, theme], index) => {
  const key = `${slug}:${chapter}:${start}:${end}`;
  if (keys.has(key)) throw new Error(`Duplicate daily passage: ${key}`);
  keys.add(key);
  const book = bySlug.get(slug);
  if (!book) throw new Error(`Unknown daily-verse book: ${slug}`);
  const verses = book.chapters[chapter - 1];
  if (!verses || start < 1 || end < start || end > verses.length) {
    throw new Error(`Invalid daily passage: ${key}`);
  }
  const text = verses.slice(start - 1, end).join(" ").trim();
  if (!text) throw new Error(`Empty daily passage: ${key}`);
  const name = book.name === "Psalms" ? "Psalm" : book.name;
  const reference = start === end
    ? `${name} ${chapter}:${start}`
    : `${name} ${chapter}:${start}-${end}`;
  return {
    id: `dv${String(index + 1).padStart(3, "0")}`,
    reference,
    bookSlug: slug,
    chapter,
    verseStart: start,
    verseEnd: end,
    text,
    theme,
  };
});

if (pool.length !== 180) throw new Error(`Expected 180 daily verses, found ${pool.length}`);
const represented = new Set(pool.map((verse) => verse.bookSlug));
if (represented.size !== 66) throw new Error(`Expected all 66 books, found ${represented.size}`);

writeFileSync(
  path.join(root, "src/data/seed/daily-verses.json"),
  `${JSON.stringify(pool, null, 1)}\n`,
);
console.log(`Wrote ${pool.length} exact WEB passages across ${represented.size} books.`);
