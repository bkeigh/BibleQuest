/**
 * Client-safe Bible translation metadata.
 *
 * A preference is deliberately separate from the translation that supplied a
 * rendered passage. BibleQuest may prefer NIV, but it must never label the
 * bundled WEB fallback as NIV while licensing/provider access is unavailable.
 */

export const LOCAL_WEB_TRANSLATION_KEY = "web";
export const DEFAULT_BIBLE_TRANSLATION_KEY = "niv";

export type BibleTranslationSource = "local" | "api_bible";
export type BibleTranslationAvailability =
  | "bundled"
  | "connected"
  | "provider_required"
  | "license_pending";

export interface BibleTranslation {
  /** Stable preference value persisted in QuestOS. */
  key: string;
  /** Provider-specific id. Never used as the user-facing name. */
  providerId?: string;
  name: string;
  abbreviation: string;
  /** ISO 639-3 when supplied by API.Bible; `eng` for bundled WEB. */
  languageId: string;
  languageName: string;
  languageNameLocal: string;
  direction: "ltr" | "rtl";
  source: BibleTranslationSource;
  availability: BibleTranslationAvailability;
  copyright?: string;
  featured?: boolean;
}

export const WEB_TRANSLATION: BibleTranslation = {
  key: LOCAL_WEB_TRANSLATION_KEY,
  name: "World English Bible",
  abbreviation: "WEB",
  languageId: "eng",
  languageName: "English",
  languageNameLocal: "English",
  direction: "ltr",
  source: "local",
  availability: "bundled",
  copyright: "Public Domain. No copyright restrictions.",
  featured: true,
};

/**
 * The editions requested for launch. Copyrighted rows are preferences and
 * connection targets—not bundled text. Availability is resolved on the
 * server from an explicitly approved provider allow-list.
 */
export const FEATURED_TRANSLATIONS: BibleTranslation[] = [
  {
    key: "niv",
    name: "New International Version",
    abbreviation: "NIV",
    languageId: "eng",
    languageName: "English",
    languageNameLocal: "English",
    direction: "ltr",
    source: "api_bible",
    availability: "provider_required",
    featured: true,
  },
  {
    key: "kjv",
    name: "King James Version",
    abbreviation: "KJV",
    languageId: "eng",
    languageName: "English",
    languageNameLocal: "English",
    direction: "ltr",
    source: "api_bible",
    availability: "provider_required",
    featured: true,
  },
  {
    key: "nlt",
    name: "New Living Translation",
    abbreviation: "NLT",
    languageId: "eng",
    languageName: "English",
    languageNameLocal: "English",
    direction: "ltr",
    source: "api_bible",
    availability: "provider_required",
    featured: true,
  },
  {
    key: "esv",
    name: "English Standard Version",
    abbreviation: "ESV",
    languageId: "eng",
    languageName: "English",
    languageNameLocal: "English",
    direction: "ltr",
    source: "api_bible",
    availability: "provider_required",
    featured: true,
  },
  {
    key: "nkjv",
    name: "New King James Version",
    abbreviation: "NKJV",
    languageId: "eng",
    languageName: "English",
    languageNameLocal: "English",
    direction: "ltr",
    source: "api_bible",
    availability: "provider_required",
    featured: true,
  },
  WEB_TRANSLATION,
];

const featuredByKey = new Map(FEATURED_TRANSLATIONS.map((item) => [item.key, item]));

const CONNECTED_TRANSLATION_KEY = /^api:[a-f0-9]{16}-\d{2}$/i;

/**
 * Preferences can arrive from localStorage, an imported backup, or an
 * account row. Keep that untrusted value inside the small set the resolver
 * understands so malformed data cannot reach string helpers or API routes.
 */
export function normalizeBibleTranslationKey(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_BIBLE_TRANSLATION_KEY;
  const key = value.trim().toLowerCase();
  if (featuredByKey.has(key) || CONNECTED_TRANSLATION_KEY.test(key)) return key;
  return DEFAULT_BIBLE_TRANSLATION_KEY;
}

export function featuredTranslation(key: string): BibleTranslation | undefined {
  return featuredByKey.get(key);
}

/**
 * Validate a translation key before carrying it through a reader URL. Featured
 * keys are intentionally readable; connected provider ids stay opaque and
 * tightly bounded so arbitrary query text never becomes reader state.
 */
export function bibleTranslationKey(
  value: string | null | undefined,
): string | undefined {
  if (!value || value.length > 80) return undefined;
  return featuredTranslation(value) || CONNECTED_TRANSLATION_KEY.test(value)
    ? value
    : undefined;
}

export function translationPreferenceLabel(key: string): string {
  const normalized = normalizeBibleTranslationKey(key);
  const featured = featuredTranslation(normalized);
  if (featured) return featured.abbreviation;
  return normalized.startsWith("api:") ? "Connected translation" : "NIV";
}

export function isRemoteTranslationKey(key: string): boolean {
  return key !== LOCAL_WEB_TRANSLATION_KEY;
}

/** Top-language order for the connected catalogue; all other languages follow. */
export const PRIORITY_BIBLE_LANGUAGE_IDS = [
  "eng",
  "spa",
  "zho",
  "cmn",
  "hin",
  "por",
  "fra",
  "arb",
  "rus",
  "ind",
  "swa",
];

export interface ResolvedBiblePassage {
  text: string;
  requestedKey: string;
  effectiveTranslation: BibleTranslation;
  fallbackReason?: "provider_not_configured" | "translation_unavailable" | "content_unavailable";
  /** API.Bible Fair Use Management token; report only when content is shown. */
  fumsToken?: string;
}
