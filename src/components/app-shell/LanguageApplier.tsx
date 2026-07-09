"use client";

import { useEffect } from "react";
import { useQuestOS } from "@/lib/questos/store";
import { languageMeta } from "@/lib/i18n/languages";

/**
 * Applies the chosen UI language to <html> (lang + dir) so screen
 * readers, hyphenation, and RTL layout follow settings.language.
 * Headless — mounts once inside AppShell.
 */
export function LanguageApplier() {
  const language = useQuestOS((s) => s.settings.language);

  useEffect(() => {
    const meta = languageMeta(language ?? "en");
    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;
  }, [language]);

  return null;
}
