import "server-only";

import {
  HELLOAO_OPEN_TRANSLATIONS,
  type BibleTranslation,
} from "./translations";

const HELLOAO_API_BASE = "https://bible.helloao.org/api";
// A short cache still avoids repeated chapter downloads while preventing a
// transient malformed 200 response from pinning local fallback for a week.
const HELLOAO_REVALIDATE_SECONDS = 60 * 60 * 24;
const HELLOAO_TIMEOUT_MS = 5_000;
export const HELLOAO_MAX_RESPONSE_BYTES = 256 * 1024;

const PROVIDER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BOOK_ID = /^(?:[1-3])?[A-Z]{2,3}$/;
const MAX_CHAPTER_CONTENT_ITEMS = 1_000;
const MAX_VERSE_CONTENT_ITEMS = 1_000;
const MAX_FOOTNOTES = 1_000;
const MAX_TEXT_PIECE_LENGTH = 32_000;
const MAX_VERSE_TEXT_LENGTH = 64_000;

// HelloAO's BSB document currently identifies the publisher homepage as its
// license URL. BibleQuest links people to the publisher's more precise
// licensing page, while still pinning the provider document's exact metadata.
const PROVIDER_LICENSE_URL_BY_KEY: Readonly<Record<string, string>> = {
  bsb: "https://berean.bible/",
};

type HelloAoErrorCode = "translation_unavailable" | "content_unavailable";

export class HelloAoError extends Error {
  constructor(
    public readonly code: HelloAoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HelloAoError";
  }
}

interface HelloAoChapterResult {
  translation: BibleTranslation;
  verses: Map<number, string>;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function contentError(message: string): HelloAoError {
  return new HelloAoError("content_unavailable", message);
}

function cleanProviderText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?，。；：！？、）》」』】])/g, "$1")
    .replace(/([（《「『【])\s+/g, "$1")
    .replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "")
    .trim();
}

function boundedString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_TEXT_PIECE_LENGTH) {
    throw contentError(`HelloAO returned invalid ${label}.`);
  }
  return value;
}

function validateFootnotes(value: unknown): Set<number> {
  if (!Array.isArray(value) || value.length > MAX_FOOTNOTES) {
    throw contentError("HelloAO returned invalid footnotes.");
  }

  const noteIds = new Set<number>();
  for (const item of value) {
    const footnote = record(item);
    if (
      !footnote ||
      !Number.isInteger(footnote.noteId) ||
      Number(footnote.noteId) < 0 ||
      (footnote.caller !== null && typeof footnote.caller !== "string")
    ) {
      throw contentError("HelloAO returned an invalid footnote.");
    }
    boundedString(footnote.text, "footnote text");
    const reference = footnote.reference;
    if (reference !== undefined) {
      const referenceRecord = record(reference);
      if (
        !referenceRecord ||
        !Number.isInteger(referenceRecord.chapter) ||
        !Number.isInteger(referenceRecord.verse) ||
        Number(referenceRecord.chapter) < 1 ||
        Number(referenceRecord.verse) < 1
      ) {
        throw contentError("HelloAO returned an invalid footnote reference.");
      }
    }
    noteIds.add(Number(footnote.noteId));
  }
  return noteIds;
}

function parseContentPiece(
  value: unknown,
  noteIds: ReadonlySet<number>,
): string {
  if (typeof value === "string") {
    return boundedString(value, "verse text");
  }

  const item = record(value);
  if (!item) throw contentError("HelloAO returned invalid verse content.");

  if ("text" in item) {
    return boundedString(item.text, "formatted verse text");
  }
  if ("heading" in item) {
    // Inline headings are navigation/editorial metadata, not Scripture text.
    boundedString(item.heading, "inline heading");
    return "";
  }
  if (item.lineBreak === true) return " ";
  if ("noteId" in item) {
    if (
      !Number.isInteger(item.noteId) ||
      Number(item.noteId) < 0 ||
      !noteIds.has(Number(item.noteId))
    ) {
      throw contentError("HelloAO returned an invalid footnote marker.");
    }
    // Footnote text is preserved in the validated document but is not folded
    // into the canonical verse wording displayed or shared by BibleQuest.
    return "";
  }

  throw contentError("HelloAO returned an unknown verse content item.");
}

function validateEditorialContent(
  value: unknown,
  noteIds: ReadonlySet<number>,
): void {
  if (!Array.isArray(value) || value.length > MAX_VERSE_CONTENT_ITEMS) {
    throw contentError("HelloAO returned invalid editorial content.");
  }
  for (const item of value) {
    // Headings and Hebrew subtitles are deliberately excluded from the verse
    // map, but their documented shapes are still checked before trusting the
    // document as Scripture content.
    parseContentPiece(item, noteIds);
  }
}

/**
 * Parse one validated HelloAO chapter into canonical verse text. Editorial
 * headings, line breaks, and footnote markers are understood but kept out of
 * the returned Scripture wording.
 */
export function parseHelloAoChapter(
  chapterValue: unknown,
): Map<number, string> {
  const chapter = record(chapterValue);
  if (
    !chapter ||
    !Number.isInteger(chapter.number) ||
    Number(chapter.number) < 1 ||
    !Array.isArray(chapter.content) ||
    chapter.content.length > MAX_CHAPTER_CONTENT_ITEMS
  ) {
    throw contentError("HelloAO returned an invalid chapter.");
  }

  const noteIds = validateFootnotes(chapter.footnotes);
  const piecesByVerse = new Map<number, string[]>();

  for (const itemValue of chapter.content) {
    const item = record(itemValue);
    if (!item || typeof item.type !== "string") {
      throw contentError("HelloAO returned invalid chapter content.");
    }

    if (item.type === "line_break") continue;
    if (item.type === "heading") {
      if (
        !Array.isArray(item.content) ||
        item.content.length > MAX_VERSE_CONTENT_ITEMS
      ) {
        throw contentError("HelloAO returned an invalid heading.");
      }
      for (const heading of item.content) {
        boundedString(heading, "heading");
      }
      continue;
    }
    if (item.type === "hebrew_subtitle") {
      validateEditorialContent(item.content, noteIds);
      continue;
    }
    if (item.type !== "verse") {
      throw contentError("HelloAO returned unknown chapter content.");
    }

    const verseNumber = Number(item.number);
    if (
      !Number.isInteger(item.number) ||
      verseNumber < 1 ||
      verseNumber > 500 ||
      !Array.isArray(item.content) ||
      item.content.length > MAX_VERSE_CONTENT_ITEMS
    ) {
      throw contentError("HelloAO returned an invalid verse.");
    }

    const pieces = item.content.map((piece) =>
      parseContentPiece(piece, noteIds),
    );
    const existing = piecesByVerse.get(verseNumber) ?? [];
    existing.push(...pieces);
    piecesByVerse.set(verseNumber, existing);
  }

  const verses = new Map<number, string>();
  for (const [verseNumber, pieces] of piecesByVerse) {
    const text = cleanProviderText(pieces.join(" "));
    if (!text || text.length > MAX_VERSE_TEXT_LENGTH) {
      throw contentError("HelloAO returned invalid verse text.");
    }
    verses.set(verseNumber, text);
  }
  if (!verses.size) {
    throw contentError("HelloAO returned no verse text.");
  }
  return verses;
}

function allowlistedTranslation(key: string): BibleTranslation | null {
  const match = HELLOAO_OPEN_TRANSLATIONS.find(
    (translation) =>
      translation.key === key &&
      translation.source === "helloao" &&
      translation.availability === "open" &&
      typeof translation.providerId === "string" &&
      PROVIDER_ID.test(translation.providerId) &&
      typeof translation.providerSha256 === "string" &&
      SHA256.test(translation.providerSha256),
  );
  return match ?? null;
}

function matchesPinnedTranslationMetadata(
  metadata: JsonRecord,
  translation: BibleTranslation,
): boolean {
  const formats = metadata.availableFormats;
  if (
    !Array.isArray(formats) ||
    !formats.every((format) => typeof format === "string") ||
    !formats.includes("json")
  ) {
    return false;
  }

  const pinnedFields: Array<[unknown, unknown]> = [
    [metadata.id, translation.providerId],
    [metadata.sha256, translation.providerSha256],
    [metadata.language, translation.languageId],
    [metadata.textDirection, translation.direction],
    [
      metadata.licenseUrl,
      PROVIDER_LICENSE_URL_BY_KEY[translation.key] ?? translation.licenseUrl,
    ],
    [metadata.website, translation.website],
    [metadata.numberOfBooks, translation.numberOfBooks],
    [metadata.totalNumberOfChapters, translation.totalNumberOfChapters],
    [metadata.totalNumberOfVerses, translation.totalNumberOfVerses],
  ];
  return pinnedFields.every(
    ([actual, expected]) => expected === undefined || actual === expected,
  );
}

export function isHelloAoTranslationKey(key: string): boolean {
  return Boolean(allowlistedTranslation(key));
}

export function resolveHelloAoTranslation(key: string): BibleTranslation {
  const translation = allowlistedTranslation(key);
  if (!translation) {
    throw new HelloAoError(
      "translation_unavailable",
      "That open translation is not enabled for BibleQuest.",
    );
  }
  return translation;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const bytes = Number(declaredLength);
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > HELLOAO_MAX_RESPONSE_BYTES) {
      throw contentError("HelloAO returned an oversized response.");
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > HELLOAO_MAX_RESPONSE_BYTES) {
      throw contentError("HelloAO returned an oversized response.");
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw contentError("HelloAO returned invalid JSON.");
    }
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > HELLOAO_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw contentError("HelloAO returned an oversized response.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof HelloAoError) throw error;
    throw contentError("HelloAO returned invalid JSON.");
  }
}

async function fetchHelloAoDocument(
  translation: BibleTranslation,
  bookId: string,
  chapterNumber: number,
): Promise<HelloAoChapterResult> {
  if (
    !translation.providerId ||
    !PROVIDER_ID.test(translation.providerId) ||
    !BOOK_ID.test(bookId) ||
    !Number.isInteger(chapterNumber) ||
    chapterNumber < 1 ||
    chapterNumber > 200
  ) {
    throw contentError("Invalid HelloAO chapter request.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HELLOAO_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${HELLOAO_API_BASE}/${encodeURIComponent(translation.providerId)}/${encodeURIComponent(bookId)}/${chapterNumber}.json`,
      {
        headers: { accept: "application/json" },
        signal: controller.signal,
        redirect: "error",
        cache: "force-cache",
        next: { revalidate: HELLOAO_REVALIDATE_SECONDS },
      },
    );
    if (!response.ok) {
      throw contentError(`HelloAO returned ${response.status}.`);
    }
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      throw contentError("HelloAO returned a non-JSON response.");
    }

    const payload = record(await readBoundedJson(response));
    const metadata = record(payload?.translation);
    const book = record(payload?.book);
    const chapter = record(payload?.chapter);
    if (
      !payload ||
      !metadata ||
      !matchesPinnedTranslationMetadata(metadata, translation) ||
      !book ||
      book.id !== bookId ||
      book.translationId !== translation.providerId ||
      !chapter ||
      chapter.number !== chapterNumber
    ) {
      throw contentError("HelloAO returned mismatched chapter metadata.");
    }

    return {
      // Identity, attribution, and license fields stay pinned to the reviewed
      // static allowlist. The upstream document can supply content, but cannot
      // rewrite the edition name or commercial-use notice rendered by the UI.
      translation: { ...translation },
      verses: parseHelloAoChapter(chapter),
    };
  } catch (error) {
    if (error instanceof HelloAoError) throw error;
    throw contentError(
      controller.signal.aborted
        ? "HelloAO timed out."
        : "HelloAO could not return Scripture content.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHelloAoChapter(
  translationKey: string,
  bookId: string,
  chapter: number,
): Promise<HelloAoChapterResult> {
  const translation = resolveHelloAoTranslation(translationKey);
  return fetchHelloAoDocument(translation, bookId, chapter);
}

export async function fetchHelloAoPassage(
  translationKey: string,
  bookId: string,
  chapter: number,
  start: number,
  end: number,
): Promise<{ translation: BibleTranslation; text: string }> {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start ||
    end - start > 7
  ) {
    throw contentError("Invalid HelloAO passage request.");
  }

  const result = await fetchHelloAoChapter(translationKey, bookId, chapter);
  const pieces: string[] = [];
  for (let verse = start; verse <= end; verse += 1) {
    const text = result.verses.get(verse)?.trim();
    if (!text) {
      throw contentError(
        `HelloAO did not return requested verse ${chapter}:${verse}.`,
      );
    }
    pieces.push(text);
  }
  const text = cleanProviderText(pieces.join(" "));
  if (!text) throw contentError("The HelloAO passage was empty.");
  return { translation: result.translation, text };
}
