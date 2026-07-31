import { describe, expect, it } from "vitest";
import {
  createDeviceBackupExtras,
  DEVICE_BACKUP_KEY,
  parseDeviceBackupExtras,
} from "@/lib/backup/device-extras";
import type { RhythmState } from "@/lib/rhythm/types";

// A valid fixture proves durable rhythm preferences can travel in an export.
const RHYTHM: RhythmState = {
  version: 1,
  blocks: [
    {
      id: "rhythm_backup01",
      label: "Morning",
      time: "08:00",
      days: [1, 3, 5],
      practices: ["quest", "guided_scripture"],
      fallbackPractice: null,
      createdAt: "2026-07-29T12:00:00.000Z",
      updatedAt: "2026-07-29T12:00:00.000Z",
    },
  ],
};

describe("device preference backup extras", () => {
  it("round-trips a strictly validated rhythm beside the journey", () => {
    const exported = {
      profile: null,
      [DEVICE_BACKUP_KEY]: createDeviceBackupExtras(RHYTHM),
    };
    expect(parseDeviceBackupExtras(JSON.stringify(exported))).toEqual({
      ok: true,
      data: { version: 1, rhythm: RHYTHM },
    });
  });

  it("keeps older journey files compatible", () => {
    expect(
      parseDeviceBackupExtras(JSON.stringify({ profile: null })),
    ).toEqual({ ok: true, data: null });
  });

  it("rejects malformed extras without echoing their content", () => {
    const marker = "private-device-marker";
    const result = parseDeviceBackupExtras(
      JSON.stringify({
        [DEVICE_BACKUP_KEY]: {
          version: 1,
          rhythm: { version: 1, blocks: marker },
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain(marker);
  });
});
