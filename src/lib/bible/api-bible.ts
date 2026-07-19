import "server-only";

import {
  FEATURED_TRANSLATIONS,
  PRIORITY_BIBLE_LANGUAGE_IDS,
  type BibleTranslation,
} from "./translations";
import {
  joinApiBibleVerseRange,
  parseApiBibleContent,
  type ApiBibleNode,
} from "./api-bible-content";
import { API_BIBLE_FUMS_TOKEN } from "./fums";

const API_BASE = "https://rest.api.bible/v1";
const FOURTEEN_DAYS = 60 * 60 * 24 * 14;
const API_BIBLE_TIMEOUT_MS = 5_000;
export const API_BIBLE_MAX_RESPONSE_BYTES = 512 * 1024;
const PROVIDER_ID = /^[a-f0-9]{16}-\d{2}$/i;

interface ApiBibleLanguage {
  id?: string;
  name?: string;
  nameLocal?: string;
  scriptDirection?: string;
}

interface ApiBibleCatalogItem {
  id?: string;
  name?: string;
  nameLocal?: string;
  abbreviation?: string;
  abbreviationLocal?: string;
  copyright?: string;
  language?: ApiBibleLanguage;
}

type JsonRecord = Record<string, unknown>;

const MAX_CATALOG_ITEMS = 500;
const MAX_CONTENT_NODES = 10_000;
const MAX_CONTENT_DEPTH = 32;
const MAX_PROVIDER_TEXT_LENGTH = 64_000;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function optionalBoundedString(value: unknown, maximum: number): boolean {
  return value === undefined ||
    (typeof value === "string" && value.length <= maximum);
}

function validatedCatalogItem(value: unknown): ApiBibleCatalogItem | null {
  const item = record(value);
  if (!item) return null;
  if (
    !optionalBoundedString(item.id, 64) ||
    !optionalBoundedString(item.name, 512) ||
    !optionalBoundedString(item.nameLocal, 512) ||
    !optionalBoundedString(item.abbreviation, 128) ||
    !optionalBoundedString(item.abbreviationLocal, 128) ||
    !optionalBoundedString(item.copyright, 16_000)
  ) {
    return null;
  }

  const language =
    item.language === undefined ? undefined : record(item.language);
  if (
    item.language !== undefined &&
    (!language ||
      !optionalBoundedString(language.id, 64) ||
      !optionalBoundedString(language.name, 512) ||
      !optionalBoundedString(language.nameLocal, 512) ||
      !optionalBoundedString(language.scriptDirection, 16))
  ) {
    return null;
  }

  return {
    id: item.id as string | undefined,
    name: item.name as string | undefined,
    nameLocal: item.nameLocal as string | undefined,
    abbreviation: item.abbreviation as string | undefined,
    abbreviationLocal: item.abbreviationLocal as string | undefined,
    copyright: item.copyright as string | undefined,
    language: language
      ? {
          id: language.id as string | undefined,
          name: language.name as string | undefined,
          nameLocal: language.nameLocal as string | undefined,
          scriptDirection: language.scriptDirection as string | undefined,
        }
      : undefined,
  };
}

function validatedContentNodes(
  value: unknown,
  depth = 0,
  budget = { count: 0 },
): ApiBibleNode[] | null {
  if (!Array.isArray(value) || depth > MAX_CONTENT_DEPTH) return null;
  const nodes: ApiBibleNode[] = [];
  for (const rawNode of value) {
    budget.count += 1;
    if (budget.count > MAX_CONTENT_NODES) return null;
    const item = record(rawNode);
    if (
      !item ||
      !optionalBoundedString(item.name, 128) ||
      !optionalBoundedString(item.type, 128) ||
      !optionalBoundedString(item.text, MAX_PROVIDER_TEXT_LENGTH)
    ) {
      return null;
    }

    let attrs: ApiBibleNode["attrs"];
    if (item.attrs !== undefined) {
      const rawAttrs = record(item.attrs);
      if (
        !rawAttrs ||
        !optionalBoundedString(rawAttrs.number, 256) ||
        !optionalBoundedString(rawAttrs.sid, 256) ||
        !optionalBoundedString(rawAttrs.verseId, 256) ||
        (rawAttrs.verseOrgIds !== undefined &&
          (!Array.isArray(rawAttrs.verseOrgIds) ||
            rawAttrs.verseOrgIds.length > 500 ||
            !rawAttrs.verseOrgIds.every(
              (id) => typeof id === "string" && id.length <= 256,
            )))
      ) {
        return null;
      }
      attrs = {
        number: rawAttrs.number as string | undefined,
        sid: rawAttrs.sid as string | undefined,
        verseId: rawAttrs.verseId as string | undefined,
        verseOrgIds: rawAttrs.verseOrgIds as string[] | undefined,
      };
    }

    let items: ApiBibleNode[] | undefined;
    if (item.items !== undefined) {
      const nested = validatedContentNodes(item.items, depth + 1, budget);
      if (!nested) return null;
      items = nested;
    }
    nodes.push({
      name: item.name as string | undefined,
      type: item.type as string | undefined,
      text: item.text as string | undefined,
      attrs,
      items,
    });
  }
  return nodes;
}

export class ApiBibleError extends Error {
  constructor(
    public readonly code:
      | "provider_not_configured"
      | "translation_unavailable"
      | "content_unavailable",
    message: string,
  ) {
    super(message);
  }
}

function apiKey(): string | null {
  return process.env.API_BIBLE_API_KEY?.trim() || null;
}

/**
 * Access in an API catalog is not proof of commercial rights. The founder
 * must copy only Bible IDs explicitly licensed for BibleQuest's commercial
 * plan into this server-only allow-list.
 */
function allowedProviderIds(): Set<string> {
  // Prefer the explicit commercial-license name. Keep the original variable
  // as a compatibility alias for already-configured deployments, but an
  // explicitly present (even blank) new variable always wins so operators can
  // deliberately disable every remote edition.
  const configuredIds =
    process.env.API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS !== undefined
      ? process.env.API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS
      : process.env.API_BIBLE_ALLOWED_BIBLE_IDS;
  return new Set(
    (configuredIds ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => PROVIDER_ID.test(id)),
  );
}

function normalize(value: string | undefined): string {
  return (value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function featuredKey(item: ApiBibleCatalogItem): string | null {
  const abbreviations = new Set([
    normalize(item.abbreviation),
    normalize(item.abbreviationLocal),
  ]);
  const names = new Set([normalize(item.name), normalize(item.nameLocal)]);

  for (const translation of FEATURED_TRANSLATIONS) {
    // Open/local editions can share names and abbreviations with API.Bible
    // catalogue rows. Only API.Bible preferences may claim an API.Bible item;
    // otherwise a provider row with a colliding name or abbreviation could
    // silently replace a reviewed open edition.
    if (translation.source !== "api_bible") continue;
    if (abbreviations.has(normalize(translation.abbreviation))) {
      return translation.key;
    }
    if (names.has(normalize(translation.name))) return translation.key;
  }
  return null;
}

function toTranslation(item: ApiBibleCatalogItem): BibleTranslation | null {
  if (!item.id || !PROVIDER_ID.test(item.id) || !item.name) return null;
  const matchedFeatured = featuredKey(item);

  const abbreviation =
    item.abbreviationLocal?.trim() || item.abbreviation?.trim() || item.name;
  const languageName = item.language?.name?.trim() || "Other language";
  return {
    key: matchedFeatured ?? `api:${item.id}`,
    providerId: item.id,
    name: item.nameLocal?.trim() || item.name,
    abbreviation,
    languageId: item.language?.id?.trim() || "und",
    languageName,
    languageNameLocal: item.language?.nameLocal?.trim() || languageName,
    direction:
      item.language?.scriptDirection?.toUpperCase() === "RTL" ? "rtl" : "ltr",
    source: "api_bible",
    contentUsePolicy: "licensed_transient",
    availability: "connected",
    copyright: item.copyright?.trim() || undefined,
    featured: Boolean(matchedFeatured),
  };
}

async function readBoundedProviderJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const bytes = Number(declaredLength);
    if (
      !Number.isFinite(bytes) ||
      bytes < 0 ||
      bytes > API_BIBLE_MAX_RESPONSE_BYTES
    ) {
      throw new ApiBibleError(
        "content_unavailable",
        "API.Bible returned an oversized response.",
      );
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (
      new TextEncoder().encode(text).byteLength >
      API_BIBLE_MAX_RESPONSE_BYTES
    ) {
      throw new ApiBibleError(
        "content_unavailable",
        "API.Bible returned an oversized response.",
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ApiBibleError(
        "content_unavailable",
        "API.Bible returned invalid JSON.",
      );
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
      if (total > API_BIBLE_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ApiBibleError(
          "content_unavailable",
          "API.Bible returned an oversized response.",
        );
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
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch (error) {
    if (error instanceof ApiBibleError) throw error;
    throw new ApiBibleError(
      "content_unavailable",
      "API.Bible returned invalid JSON.",
    );
  }
}

async function providerFetch(path: string): Promise<unknown> {
  const key = apiKey();
  if (!key) {
    throw new ApiBibleError(
      "provider_not_configured",
      "The licensed Bible provider is not configured.",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_BIBLE_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "api-key": key, accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
      cache: "force-cache",
      next: { revalidate: FOURTEEN_DAYS },
    });
    if (!response.ok) {
      throw new ApiBibleError(
        response.status === 401 || response.status === 403
          ? "translation_unavailable"
          : "content_unavailable",
        `API.Bible returned ${response.status}.`,
      );
    }
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      throw new ApiBibleError(
        "content_unavailable",
        "API.Bible returned a non-JSON response.",
      );
    }
    return await readBoundedProviderJson(response);
  } catch (error) {
    if (error instanceof ApiBibleError) throw error;
    throw new ApiBibleError(
      "content_unavailable",
      controller.signal.aborted
        ? "API.Bible timed out."
        : "API.Bible could not return Scripture content.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export function apiBibleConfigured(): boolean {
  return Boolean(apiKey() && allowedProviderIds().size > 0);
}

export async function listApprovedApiBibles(): Promise<BibleTranslation[]> {
  if (!apiBibleConfigured()) return [];
  const approved = allowedProviderIds();
  const ids = [...approved].join(",");
  const query = new URLSearchParams({ ids, "include-full-details": "true" });
  const body = record(await providerFetch(`/bibles?${query}`));
  if (
    !body ||
    !Array.isArray(body.data) ||
    body.data.length > MAX_CATALOG_ITEMS
  ) {
    throw new ApiBibleError(
      "content_unavailable",
      "API.Bible returned an invalid translation catalogue.",
    );
  }
  const translations = body.data
    .map(validatedCatalogItem)
    .filter((item): item is ApiBibleCatalogItem => Boolean(item))
    .filter((item) => Boolean(item.id && approved.has(item.id)))
    .map(toTranslation)
    .filter((item): item is BibleTranslation => Boolean(item));

  const priority = new Map(
    PRIORITY_BIBLE_LANGUAGE_IDS.map((language, index) => [language, index]),
  );
  return translations.sort((a, b) => {
    const languageOrder =
      (priority.get(a.languageId) ?? Number.MAX_SAFE_INTEGER) -
      (priority.get(b.languageId) ?? Number.MAX_SAFE_INTEGER);
    if (languageOrder) return languageOrder;
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function resolveApprovedTranslation(
  preferenceKey: string,
): Promise<BibleTranslation> {
  const translations = await listApprovedApiBibles();
  const match = preferenceKey.startsWith("api:")
    ? translations.find(
        (item) => item.providerId === preferenceKey.slice("api:".length),
      )
    : translations.find((item) => item.key === preferenceKey);
  if (!match) {
    throw new ApiBibleError(
      apiBibleConfigured()
        ? "translation_unavailable"
        : "provider_not_configured",
      "That translation is not enabled for BibleQuest's commercial plan.",
    );
  }
  return match;
}

async function fetchContent(
  translation: BibleTranslation,
  resourcePath: string,
): Promise<{
  verses: Map<number, string>;
  copyright?: string;
  fumsToken?: string;
}> {
  if (!translation.providerId) {
    throw new ApiBibleError("translation_unavailable", "Missing provider id.");
  }
  const query = new URLSearchParams({
    "content-type": "json",
    "include-notes": "false",
    "include-titles": "false",
    "include-chapter-numbers": "false",
    "include-verse-numbers": "true",
    "fums-version": "3",
  });
  const body = record(await providerFetch(
    `/bibles/${translation.providerId}/${resourcePath}?${query}`,
  ));
  const data = record(body?.data);
  const meta = record(body?.meta);
  const content = validatedContentNodes(data?.content);
  const copyright = data?.copyright;
  const fumsToken =
    typeof meta?.fumsToken === "string" ? meta.fumsToken.trim() : "";
  if (
    !body ||
    !data ||
    !content ||
    !optionalBoundedString(copyright, 16_000) ||
    !API_BIBLE_FUMS_TOKEN.test(fumsToken)
  ) {
    throw new ApiBibleError(
      "content_unavailable",
      "API.Bible returned invalid Scripture content metadata.",
    );
  }
  const verses = parseApiBibleContent(content);
  if (!verses.size) {
    throw new ApiBibleError(
      "content_unavailable",
      "The provider returned no verse text.",
    );
  }
  return {
    verses,
    copyright:
      (typeof copyright === "string" ? copyright.trim() : "") ||
      translation.copyright,
    fumsToken,
  };
}

export async function fetchApiBibleChapter(
  translationKey: string,
  bookId: string,
  chapter: number,
) {
  const translation = await resolveApprovedTranslation(translationKey);
  const result = await fetchContent(
    translation,
    `chapters/${bookId}.${chapter}`,
  );
  return {
    translation: { ...translation, copyright: result.copyright },
    verses: result.verses,
    fumsToken: result.fumsToken,
  };
}

export async function fetchApiBiblePassage(
  translationKey: string,
  bookId: string,
  chapter: number,
  start: number,
  end: number,
) {
  const translation = await resolveApprovedTranslation(translationKey);
  const first = `${bookId}.${chapter}.${start}`;
  const last = `${bookId}.${chapter}.${end}`;
  const passageId = start === end ? first : `${first}-${last}`;
  const result = await fetchContent(
    translation,
    `passages/${passageId}`,
  );
  // Some editions intentionally group several canonical verse numbers into
  // one provider span. The parser associates that span with every covered
  // number so a request for any member resolves, but a range must display the
  // shared text only once.
  const text = joinApiBibleVerseRange(result.verses, start, end);
  if (!text) {
    throw new ApiBibleError("content_unavailable", "The passage was empty.");
  }
  return {
    translation: { ...translation, copyright: result.copyright },
    text,
    fumsToken: result.fumsToken,
  };
}
