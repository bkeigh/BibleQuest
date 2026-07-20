"use client";

import { useEffect } from "react";
import { purgeExpiredDeviceLocalJournalDrafts } from "@/lib/questos/journal-drafts";

/** Enforce bounded local-draft retention whenever BibleQuest is opened. */
export function JournalDraftJanitor() {
  useEffect(() => {
    purgeExpiredDeviceLocalJournalDrafts();
  }, []);

  return null;
}
