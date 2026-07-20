/**
 * Client-safe Bible translation metadata.
 *
 * A preference is deliberately separate from the translation that supplied a
 * rendered passage. BibleQuest may prefer a remote edition, but it must never
 * label the bundled WEB fallback as that edition while provider access is
 * unavailable.
 */

import { DEFAULT_BIBLE_TRANSLATION_KEY } from "./defaults";

export { DEFAULT_BIBLE_TRANSLATION_KEY } from "./defaults";

export const LOCAL_WEB_TRANSLATION_KEY = "web";

export type BibleTranslationSource = "local" | "api_bible" | "helloao";
export type BibleContentUsePolicy = "public_domain" | "licensed_transient";
export type BibleTranslationAvailability =
  | "bundled"
  | "open"
  | "connected"
  | "provider_required"
  | "license_pending";

export interface BibleTranslation {
  /** Stable preference value persisted in QuestOS. */
  key: string;
  /** Provider-specific id. Never used as the user-facing name. */
  providerId?: string;
  /** Reviewed upstream text revision; the server fails closed if it changes. */
  providerSha256?: string;
  name: string;
  abbreviation: string;
  /** ISO 639-3 when supplied by API.Bible; `eng` for bundled WEB. */
  languageId: string;
  languageName: string;
  languageNameLocal: string;
  direction: "ltr" | "rtl";
  source: BibleTranslationSource;
  /** Explicit persistence/export boundary; never infer rights from provider. */
  contentUsePolicy: BibleContentUsePolicy;
  availability: BibleTranslationAvailability;
  copyright?: string;
  /** Publisher/source terms shown beside open or licensed Scripture. */
  licenseUrl?: string;
  licenseNotice?: string;
  website?: string;
  /** Completeness evidence captured when reviewing an open catalogue entry. */
  numberOfBooks?: number;
  totalNumberOfChapters?: number;
  totalNumberOfVerses?: number;
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
  contentUsePolicy: "public_domain",
  availability: "bundled",
  copyright: "Public Domain. No copyright restrictions.",
  featured: true,
};

const BSB_TRANSLATION: BibleTranslation = {
  key: "bsb",
  providerId: "BSB",
  providerSha256:
    "6cc5238e442b4204b0f617cc5c932bc04f3bae4a0658e6393b0e319653ebe37f",
  name: "Berean Standard Bible",
  abbreviation: "BSB",
  languageId: "eng",
  languageName: "English",
  languageNameLocal: "English",
  direction: "ltr",
  source: "helloao",
  contentUsePolicy: "public_domain",
  availability: "open",
  copyright:
    "Berean Standard Bible (BSB) · Public domain as of April 30, 2023. Served by the HelloAO Free Use Bible API.",
  licenseNotice: "Public-domain open edition · HelloAO",
  licenseUrl: "https://berean.bible/licensing.htm",
  website: "https://berean.bible/",
  numberOfBooks: 66,
  totalNumberOfChapters: 1189,
  totalNumberOfVerses: 31086,
  featured: true,
};

const KJV_TRANSLATION: BibleTranslation = {
  // Keep the established preference key stable while moving its source from
  // the licensed adapter to HelloAO's reviewed, keyless open edition.
  key: "kjv",
  providerId: "eng_kjv",
  providerSha256:
    "a847712eeaae26124d3f9db80a1a9274742981261961b49715f43809774eb43c",
  name: "King James Version",
  abbreviation: "KJV",
  languageId: "eng",
  languageName: "English",
  languageNameLocal: "English",
  direction: "ltr",
  source: "helloao",
  contentUsePolicy: "public_domain",
  availability: "open",
  copyright:
    "King James Version (KJV) · Public domain in the United States and most countries; UK Crown rights apply. From eBible.org via HelloAO.",
  licenseNotice: "Public domain in the U.S.; UK Crown rights apply · eBible.org via HelloAO",
  licenseUrl: "https://ebible.org/Scriptures/details.php?id=eng-kjv2006",
  website: "https://ebible.org/Scriptures/details.php?id=eng-kjv2006",
  numberOfBooks: 66,
  totalNumberOfChapters: 1189,
  totalNumberOfVerses: 31102,
  featured: true,
};

/**
 * Reviewed, complete open editions the server may request from HelloAO.
 * This is deliberately a static allowlist: the public catalogue is discovery,
 * not automatic permission to expose every entry in a commercial app.
 */
export const HELLOAO_OPEN_TRANSLATIONS: BibleTranslation[] = [
  KJV_TRANSLATION,
  BSB_TRANSLATION,
  {
    key: "helloao:spa_r09",
    providerId: "spa_r09",
    providerSha256:
      "94e154b2e6e56eda1702d9e9f664357a5f2aa82634b551111b0b698d124e97d5",
    name: "Santa Biblia — Reina Valera 1909",
    abbreviation: "R09",
    languageId: "spa",
    languageName: "Spanish",
    languageNameLocal: "español",
    direction: "ltr",
    source: "helloao",
    contentUsePolicy: "public_domain",
    availability: "open",
    copyright:
      "Reina Valera 1909 · Public-domain open edition from eBible.org, served by HelloAO.",
    licenseNotice: "Public-domain open edition · eBible.org via HelloAO",
    licenseUrl: "https://ebible.org/Scriptures/details.php?id=spaRV1909",
    website: "https://ebible.org/Scriptures/details.php?id=spaRV1909",
    numberOfBooks: 66,
    totalNumberOfChapters: 1189,
    totalNumberOfVerses: 31102,
  },
  {
    key: "helloao:deu_l12",
    providerId: "deu_l12",
    providerSha256:
      "ab4c66104466c4978b1b2f9dcea944a5921959f5d38e467239e6757399eda6c6",
    name: "Lutherbibel 1912",
    abbreviation: "L12",
    languageId: "deu",
    languageName: "German",
    languageNameLocal: "Deutsch",
    direction: "ltr",
    source: "helloao",
    contentUsePolicy: "public_domain",
    availability: "open",
    copyright:
      "Lutherbibel 1912 · Public-domain open edition from eBible.org, served by HelloAO.",
    licenseNotice: "Public-domain open edition · eBible.org via HelloAO",
    licenseUrl: "https://ebible.org/Scriptures/details.php?id=deu1912",
    website: "https://ebible.org/Scriptures/details.php?id=deu1912",
    numberOfBooks: 66,
    totalNumberOfChapters: 1189,
    totalNumberOfVerses: 31102,
  },
  {
    key: "helloao:cmn_cu1",
    providerId: "cmn_cu1",
    providerSha256:
      "695cd78273e0ae8b7d4d8652df136647b8176716ed7279584f6bd047574676ff",
    name: "新标点和合本",
    abbreviation: "CU1",
    languageId: "cmn",
    languageName: "Chinese",
    languageNameLocal: "中文",
    direction: "ltr",
    source: "helloao",
    contentUsePolicy: "public_domain",
    availability: "open",
    copyright:
      "Chinese Union Version (Simplified) · Public-domain open edition from eBible.org, served by HelloAO.",
    licenseNotice: "Public-domain open edition · eBible.org via HelloAO",
    licenseUrl: "https://ebible.org/Scriptures/details.php?id=cmn-cu89s",
    website: "https://ebible.org/Scriptures/details.php?id=cmn-cu89s",
    numberOfBooks: 66,
    totalNumberOfChapters: 1189,
    totalNumberOfVerses: 31021,
  },
  {
    key: "helloao:arb_vdv",
    providerId: "arb_vdv",
    providerSha256:
      "a7dbde0da2118c438758bca1706ea71c5c2e4cec72eb996463e4c761c9f6bffb",
    name: "الكتاب المقدس باللغة العربية، فان دايك",
    abbreviation: "VDV",
    languageId: "arb",
    languageName: "Arabic",
    languageNameLocal: "العربية",
    // HelloAO currently reports this correctly, but direction remains reviewed
    // client metadata so an upstream catalogue regression cannot flip Arabic.
    direction: "rtl",
    source: "helloao",
    contentUsePolicy: "public_domain",
    availability: "open",
    copyright:
      "Arabic Van Dyck Bible · Public-domain open edition from eBible.org, served by HelloAO.",
    licenseNotice: "Public-domain open edition · eBible.org via HelloAO",
    licenseUrl: "https://ebible.org/Scriptures/details.php?id=arb-vd",
    website: "https://ebible.org/Scriptures/details.php?id=arb-vd",
    numberOfBooks: 66,
    totalNumberOfChapters: 1189,
    totalNumberOfVerses: 31104,
  },
];

/**
 * The editions requested for launch. Copyrighted rows are preferences and
 * connection targets—not bundled text. Availability is resolved on the
 * server from an explicitly approved provider allow-list.
 */
export const FEATURED_TRANSLATIONS: BibleTranslation[] = [
  KJV_TRANSLATION,
  {
    key: "niv",
    name: "New International Version",
    abbreviation: "NIV",
    languageId: "eng",
    languageName: "English",
    languageNameLocal: "English",
    direction: "ltr",
    source: "api_bible",
    contentUsePolicy: "licensed_transient",
    availability: "provider_required",
    featured: true,
  },
  BSB_TRANSLATION,
  {
    key: "nlt",
    name: "New Living Translation",
    abbreviation: "NLT",
    languageId: "eng",
    languageName: "English",
    languageNameLocal: "English",
    direction: "ltr",
    source: "api_bible",
    contentUsePolicy: "licensed_transient",
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
    contentUsePolicy: "licensed_transient",
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
    contentUsePolicy: "licensed_transient",
    availability: "provider_required",
    featured: true,
  },
  WEB_TRANSLATION,
];

export interface BibleTranslationPickerOption {
  translation: BibleTranslation;
  disabled: boolean;
}

/**
 * Keep unconnected licensed editions out of the usable picker. If an older
 * account already selected one, retain a disabled row so the WEB fallback is
 * understandable and the preference is never changed behind the user's back.
 */
export function featuredBibleTranslationOptions(
  translations: readonly BibleTranslation[],
  currentKey: string,
): BibleTranslationPickerOption[] {
  return translations
    .filter(
      (translation) =>
        translation.featured &&
        (translation.availability !== "provider_required" ||
          translation.key === currentKey),
    )
    .map((translation) => ({
      translation,
      disabled: translation.availability === "provider_required",
    }));
}

const featuredByKey = new Map(FEATURED_TRANSLATIONS.map((item) => [item.key, item]));
const helloAoByKey = new Map(
  HELLOAO_OPEN_TRANSLATIONS.map((item) => [item.key, item]),
);

const CONNECTED_TRANSLATION_KEY = /^api:[a-f0-9]{16}-\d{2}$/i;
const HELLOAO_TRANSLATION_KEY = /^helloao:[a-z0-9]+(?:_[a-z0-9]+)*$/;

function parsedBibleTranslationKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  if (!key || key.length > 80) return undefined;
  if (featuredByKey.has(key) || CONNECTED_TRANSLATION_KEY.test(key)) return key;
  // A syntactically valid provider id is not sufficient. Only the finite,
  // reviewed open-edition allowlist may cross a client or server boundary.
  if (HELLOAO_TRANSLATION_KEY.test(key) && helloAoByKey.has(key)) return key;
  return undefined;
}

/**
 * Preferences can arrive from localStorage, an imported backup, or an
 * account row. Keep that untrusted value inside the small set the resolver
 * understands so malformed data cannot reach string helpers or API routes.
 */
export function normalizeBibleTranslationKey(value: unknown): string {
  return parsedBibleTranslationKey(value) ?? DEFAULT_BIBLE_TRANSLATION_KEY;
}

export function featuredTranslation(key: string): BibleTranslation | undefined {
  return featuredByKey.get(key);
}

/** Metadata for every static client-safe edition, featured or otherwise. */
export function translationMetadata(
  key: string | null | undefined,
): BibleTranslation | undefined {
  const parsed = parsedBibleTranslationKey(key);
  return parsed
    ? featuredByKey.get(parsed) ?? helloAoByKey.get(parsed)
    : undefined;
}

/**
 * Validate a translation key before carrying it through a reader URL. Featured
 * keys are intentionally readable; connected provider ids stay opaque and
 * tightly bounded so arbitrary query text never becomes reader state.
 */
export function bibleTranslationKey(
  value: string | null | undefined,
): string | undefined {
  return parsedBibleTranslationKey(value);
}

export function translationPreferenceLabel(key: string): string {
  const normalized = normalizeBibleTranslationKey(key);
  const translation = translationMetadata(normalized);
  if (translation) return translation.abbreviation;
  return normalized.startsWith("api:")
    ? "Connected translation"
    : (translationMetadata(DEFAULT_BIBLE_TRANSLATION_KEY)?.abbreviation ??
        "Bible");
}

/**
 * API.Bible text is intentionally transient. Bundled WEB and the reviewed
 * HelloAO open editions may be persisted, exported, and shared with their
 * edition attribution intact.
 */
export function isRedistributableBibleTranslation(
  translation: BibleTranslation,
): boolean {
  return translation.contentUsePolicy === "public_domain";
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
