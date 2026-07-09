/**
 * The languages BibleQuest speaks — the world's most spoken languages plus
 * the great languages of Christian tradition: Catholic strongholds
 * (Spanish, Portuguese, Polish, Filipino, Vietnamese, Italian), Orthodox
 * (Russian, Greek, Romanian), global-south Christianity (Swahili,
 * Indonesian, Hindi), Arabic-speaking Christians — and ecclesiastical
 * Latin, for the joy of it.
 *
 * Static metadata only (the picker renders from this without loading any
 * dictionary). Dictionary files live in ./locales.
 */
export interface LanguageMeta {
  code: string;
  /** The language's own name — what the picker shows. */
  endonym: string;
  english: string;
  dir: "ltr" | "rtl";
}

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", endonym: "English", english: "English", dir: "ltr" },
  { code: "es", endonym: "Español", english: "Spanish", dir: "ltr" },
  { code: "pt", endonym: "Português (Brasil)", english: "Portuguese", dir: "ltr" },
  { code: "fr", endonym: "Français", english: "French", dir: "ltr" },
  { code: "it", endonym: "Italiano", english: "Italian", dir: "ltr" },
  { code: "de", endonym: "Deutsch", english: "German", dir: "ltr" },
  { code: "pl", endonym: "Polski", english: "Polish", dir: "ltr" },
  { code: "ru", endonym: "Русский", english: "Russian", dir: "ltr" },
  { code: "el", endonym: "Ελληνικά", english: "Greek", dir: "ltr" },
  { code: "ro", endonym: "Română", english: "Romanian", dir: "ltr" },
  { code: "fil", endonym: "Filipino", english: "Filipino", dir: "ltr" },
  { code: "vi", endonym: "Tiếng Việt", english: "Vietnamese", dir: "ltr" },
  { code: "ko", endonym: "한국어", english: "Korean", dir: "ltr" },
  { code: "zh", endonym: "中文（简体）", english: "Chinese (Simplified)", dir: "ltr" },
  { code: "hi", endonym: "हिन्दी", english: "Hindi", dir: "ltr" },
  { code: "id", endonym: "Bahasa Indonesia", english: "Indonesian", dir: "ltr" },
  { code: "sw", endonym: "Kiswahili", english: "Swahili", dir: "ltr" },
  { code: "ar", endonym: "العربية", english: "Arabic", dir: "rtl" },
  { code: "la", endonym: "Lingua Latina", english: "Latin", dir: "ltr" },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export function languageMeta(code: string): LanguageMeta {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
