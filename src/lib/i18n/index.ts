"use client";

/**
 * i18n — UI-chrome translation (see types.ts for the deliberate v1 scope).
 *
 * Usage:
 *   const t = useStrings();
 *   <span>{t.nav.quests}</span>
 *   <span>{fmt(t.quests.picked, { n: 2 })}</span>
 *
 * The hook reads settings.language from the store; unknown codes and the
 * default fall back to English. Dictionaries are small (~3KB each) and
 * statically bundled — revisit with dynamic import if the surface grows.
 */
import { useQuestOS } from "@/lib/questos/store";
import type { UIStrings } from "./types";
import { en } from "./en";
import { es } from "./locales/es";
import { pt } from "./locales/pt";
import { fr } from "./locales/fr";
import { it } from "./locales/it";
import { de } from "./locales/de";
import { pl } from "./locales/pl";
import { ru } from "./locales/ru";
import { el } from "./locales/el";
import { ro } from "./locales/ro";
import { fil } from "./locales/fil";
import { vi } from "./locales/vi";
import { ko } from "./locales/ko";
import { zh } from "./locales/zh";
import { hi } from "./locales/hi";
import { id } from "./locales/id";
import { sw } from "./locales/sw";
import { ar } from "./locales/ar";
import { la } from "./locales/la";

export type { UIStrings } from "./types";
export { LANGUAGES, LANGUAGE_CODES, languageMeta } from "./languages";
export type { LanguageMeta } from "./languages";

const DICTIONARIES: Record<string, UIStrings> = {
  en, es, pt, fr, it, de, pl, ru, el, ro, fil, vi, ko, zh, hi, id, sw, ar, la,
};

export function stringsFor(code: string | undefined): UIStrings {
  return (code && DICTIONARIES[code]) || en;
}

/** The current dictionary, driven by settings.language. Render-safe. */
export function useStrings(): UIStrings {
  const code = useQuestOS((s) => s.settings.language);
  return stringsFor(code);
}

/** Tiny template helper: fmt("{n} of 3 picked", { n: 2 }). */
export function fmt(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (m, key) =>
    key in values ? String(values[key]) : m
  );
}
