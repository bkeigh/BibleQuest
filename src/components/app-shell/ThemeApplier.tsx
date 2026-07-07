"use client";

import { useEffect } from "react";
import { useQuestOS } from "@/lib/questos/store";
import { applyAppearance } from "@/lib/theme";

/** Applies persisted appearance on mount and whenever it changes. */
export function ThemeApplier() {
  const appearance = useQuestOS((s) => s.settings.appearance);
  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);
  return null;
}
