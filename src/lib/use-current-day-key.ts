"use client";

import { useEffect, useState } from "react";
import { toDateKey } from "@/lib/utils/dates";

/** Keeps day-scoped content fresh across midnight and backgrounded PWA tabs. */
export function useCurrentDayKey(): string {
  const [dayKey, setDayKey] = useState(() => toDateKey());

  useEffect(() => {
    function refreshDay() {
      const current = toDateKey();
      setDayKey((previous) => (previous === current ? previous : current));
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") refreshDay();
    }

    const interval = window.setInterval(refreshDay, 60_000);
    window.addEventListener("focus", refreshDay);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshDay);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return dayKey;
}
