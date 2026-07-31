import {
  EMPTY_RHYTHM_STATE,
  type RhythmState,
} from "@/lib/rhythm/types";
import { parseRhythmState } from "@/lib/rhythm/validation";

export const DEVICE_BACKUP_KEY = "devicePreferences";

export interface DeviceBackupExtras {
  version: 1;
  rhythm: RhythmState;
}

export type DeviceBackupParseResult =
  | { ok: true; data: DeviceBackupExtras | null }
  | { ok: false; error: string };

/** Adds private device preferences beside, but never inside, account sync. */
export function createDeviceBackupExtras(
  rhythm: RhythmState,
): DeviceBackupExtras {
  return {
    version: 1,
    rhythm: parseRhythmState(rhythm) ?? EMPTY_RHYTHM_STATE,
  };
}

/** Validates optional Green device preferences without echoing backup content. */
export function parseDeviceBackupExtras(
  rawText: string,
): DeviceBackupParseResult {
  let value: unknown;
  try {
    value = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "That file isn’t valid JSON." };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: true, data: null };
  }

  const extra = (value as Record<string, unknown>)[DEVICE_BACKUP_KEY];
  if (extra === undefined) return { ok: true, data: null };
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
    return {
      ok: false,
      error: "That journey has an invalid device preference section.",
    };
  }

  const record = extra as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !== "rhythm,version" ||
    record.version !== 1
  ) {
    return {
      ok: false,
      error: "That journey uses unsupported device preferences.",
    };
  }
  const rhythm = parseRhythmState(record.rhythm);
  if (!rhythm) {
    return {
      ok: false,
      error: "That journey has an invalid rhythm preference.",
    };
  }
  return { ok: true, data: { version: 1, rhythm } };
}
