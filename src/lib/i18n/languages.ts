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
  /**
   * Flags a reader recognises the language by, most-associated first.
   *
   * A language is not a country, so this is a wayfinding aid rather than a
   * claim: two for English because both readings are common, two for Swahili
   * because it belongs to no single one, and the Vatican for ecclesiastical
   * Latin. The endonym is still what the picker reads out — the flag only
   * helps a reader find their line faster.
   */
  flags: string[];
}

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", endonym: "English", english: "English", dir: "ltr", flags: ["🇺🇸", "🇬🇧"] },
  { code: "es", endonym: "Español", english: "Spanish", dir: "ltr", flags: ["🇪🇸"] },
  { code: "pt", endonym: "Português (Brasil)", english: "Portuguese", dir: "ltr", flags: ["🇧🇷"] },
  { code: "fr", endonym: "Français", english: "French", dir: "ltr", flags: ["🇫🇷"] },
  { code: "it", endonym: "Italiano", english: "Italian", dir: "ltr", flags: ["🇮🇹"] },
  { code: "de", endonym: "Deutsch", english: "German", dir: "ltr", flags: ["🇩🇪"] },
  { code: "pl", endonym: "Polski", english: "Polish", dir: "ltr", flags: ["🇵🇱"] },
  { code: "ru", endonym: "Русский", english: "Russian", dir: "ltr", flags: ["🇷🇺"] },
  { code: "el", endonym: "Ελληνικά", english: "Greek", dir: "ltr", flags: ["🇬🇷"] },
  { code: "ro", endonym: "Română", english: "Romanian", dir: "ltr", flags: ["🇷🇴"] },
  { code: "fil", endonym: "Filipino", english: "Filipino", dir: "ltr", flags: ["🇵🇭"] },
  { code: "vi", endonym: "Tiếng Việt", english: "Vietnamese", dir: "ltr", flags: ["🇻🇳"] },
  { code: "ko", endonym: "한국어", english: "Korean", dir: "ltr", flags: ["🇰🇷"] },
  { code: "zh", endonym: "中文（简体）", english: "Chinese (Simplified)", dir: "ltr", flags: ["🇨🇳"] },
  { code: "hi", endonym: "हिन्दी", english: "Hindi", dir: "ltr", flags: ["🇮🇳"] },
  { code: "id", endonym: "Bahasa Indonesia", english: "Indonesian", dir: "ltr", flags: ["🇮🇩"] },
  { code: "sw", endonym: "Kiswahili", english: "Swahili", dir: "ltr", flags: ["🇰🇪", "🇹🇿"] },
  { code: "ar", endonym: "العربية", english: "Arabic", dir: "rtl", flags: ["🇸🇦"] },
  { code: "la", endonym: "Lingua Latina", english: "Latin", dir: "ltr", flags: ["🇻🇦"] },
];

export function languageMeta(code: string): LanguageMeta {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
