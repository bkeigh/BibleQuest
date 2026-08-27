"use client";

import { useEffect } from "react";
import { useQuestOS } from "@/lib/questos/store";
import {
  applyAppearance,
  syncAppearanceStatusBar,
  watchSystemTheme,
} from "@/lib/appearance/theme";

/**
 * Applies persisted appearance on mount and whenever it changes. While the
 * theme is "system", also subscribes to the OS color-scheme query so a
 * mid-session OS flip re-applies immediately instead of going stale.
 */
export function ThemeApplier() {
  const appearance = useQuestOS((s) => s.settings.appearance);
  useEffect(() => {
    applyAppearance(appearance);
    syncAppearanceStatusBar(appearance);
    return watchSystemTheme(appearance);
  }, [appearance]);
  return null;
}
