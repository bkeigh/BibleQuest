"use client";

import { useQuestOS } from "@/lib/questos/store";
import { DEVICE_JOURNEY_STORAGE_KEY } from "@/lib/storage/device-private-storage";

export interface PurgePersistedJourneyOptions {
  purgeAccount?: string;
  webOperation?: unknown;
}

/** Clears only the device journey and refuses owner-bound cleanup options. */
export function purgePersistedJourney(
  options: PurgePersistedJourneyOptions = {},
): boolean {
  if (Object.keys(options).length > 0) return false;
  try {
    useQuestOS.getState().clearAllData();
    window.localStorage.removeItem(DEVICE_JOURNEY_STORAGE_KEY);
    return window.localStorage.getItem(DEVICE_JOURNEY_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}
