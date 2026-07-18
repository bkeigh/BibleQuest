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

const API_BASE = "https://rest.api.bible/v1";
const FOURTEEN_DAYS = 60 * 60 * 24 * 14;
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

interface ApiBibleContentResponse {
  data?: {
    content?: ApiBibleNode[];
    copyright?: string;
  };
  meta?: {
    fumsToken?: string;
  };
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
    if (translation.key === "web") continue;
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
    availability: "connected",
    copyright: item.copyright?.trim() || undefined,
    featured: Boolean(matchedFeatured),
  };
}

async function providerFetch(path: string): Promise<Response> {
  const key = apiKey();
  if (!key) {
    throw new ApiBibleError(
      "provider_not_configured",
      "The licensed Bible provider is not configured.",
    );
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "api-key": key, accept: "application/json" },
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
  return response;
}

export function apiBibleConfigured(): boolean {
  return Boolean(apiKey() && allowedProviderIds().size > 0);
}

export async function listApprovedApiBibles(): Promise<BibleTranslation[]> {
  if (!apiBibleConfigured()) return [];
  const approved = allowedProviderIds();
  const ids = [...approved].join(",");
  const query = new URLSearchParams({ ids, "include-full-details": "true" });
  const response = await providerFetch(`/bibles?${query}`);
  const body = (await response.json()) as { data?: ApiBibleCatalogItem[] };
  const translations = (body.data ?? [])
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
  const response = await providerFetch(
    `/bibles/${translation.providerId}/${resourcePath}?${query}`,
  );
  const body = (await response.json()) as ApiBibleContentResponse;
  const content = body.data?.content;
  if (!Array.isArray(content)) {
    throw new ApiBibleError(
      "content_unavailable",
      "The provider did not return structured Scripture text.",
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
    copyright: body.data?.copyright?.trim() || translation.copyright,
    fumsToken: body.meta?.fumsToken?.trim() || undefined,
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
