import { describe, expect, it } from "vitest";
import {
  journeyEventToRow,
  rowToJourneyEvent,
  type JourneyEventRow,
} from "@/lib/sync/mapping";
import type { JourneyEvent } from "@/lib/questos/types";

const EVENT: JourneyEvent = {
  id: "8c17b9d3-93a6-4e15-933a-22e3f58d7e52",
  type: "prayer_created",
  title: "Prayer written",
  sourceId: "prayer:source-record",
  dateKey: "2026-07-16",
  occurredAt: "2026-07-17T06:30:00.000Z",
};

describe("Journey sync identity", () => {
  it("round-trips the originating calendar day and stable source", () => {
    const row = journeyEventToRow(
      "3db75860-d157-47e1-b14e-7a6b042227db",
      EVENT
    );

    expect(row.date_key).toBe("2026-07-16");
    expect(row.source_id).toBe("prayer:source-record");
    expect(rowToJourneyEvent(row)).toEqual(EVENT);
  });

  it("keeps rollout compatibility with rows created before date_key", () => {
    const legacyRow: JourneyEventRow = {
      id: EVENT.id,
      user_id: "3db75860-d157-47e1-b14e-7a6b042227db",
      event_type: EVENT.type,
      title: EVENT.title,
      detail: null,
      occurred_at: "2026-07-17T12:00:00.000Z",
    };

    const restored = rowToJourneyEvent(legacyRow);
    expect(restored.sourceId).toBeUndefined();
    expect(restored.dateKey).toBe("2026-07-17");
  });
});
