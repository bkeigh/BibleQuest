import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  readSevenDaysTutorialSeen,
  SEVEN_DAYS_TUTORIAL_STORAGE_KEY,
  SEVEN_DAYS_TUTORIAL_STORAGE_VERSION,
  writeSevenDaysTutorialSeen,
} from "@/lib/games/seven-days/tutorial";

/** Builds isolated browser-like storage for persistence boundary tests. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

describe("Seven Days Match tutorial persistence", () => {
  it("round-trips one versioned seen marker", () => {
    const storage = memoryStorage();
    expect(readSevenDaysTutorialSeen(storage)).toBe(false);
    expect(writeSevenDaysTutorialSeen(storage)).toBe(true);
    expect(readSevenDaysTutorialSeen(storage)).toBe(true);
    expect(JSON.parse(storage.getItem(SEVEN_DAYS_TUTORIAL_STORAGE_KEY)!)).toEqual(
      {
        version: SEVEN_DAYS_TUTORIAL_STORAGE_VERSION,
        seen: true,
      },
    );
  });

  it("removes obsolete, expanded, and oversized records", () => {
    const records = [
      JSON.stringify({ version: 99, seen: true }),
      JSON.stringify({
        version: SEVEN_DAYS_TUTORIAL_STORAGE_VERSION,
        seen: true,
        surprise: true,
      }),
      "x".repeat(256),
    ];
    for (const record of records) {
      const storage = memoryStorage();
      storage.setItem(SEVEN_DAYS_TUTORIAL_STORAGE_KEY, record);
      expect(readSevenDaysTutorialSeen(storage)).toBe(false);
      expect(storage.getItem(SEVEN_DAYS_TUTORIAL_STORAGE_KEY)).toBeNull();
    }
  });

  it("does not block play when storage is restricted", () => {
    const restricted = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(readSevenDaysTutorialSeen(restricted)).toBe(false);
    expect(writeSevenDaysTutorialSeen(restricted)).toBe(false);
  });
});

describe("Seven Days Match tutorial surface", () => {
  const session = readFileSync(
    "src/components/games/seven-days/SevenDaysLevelSession.tsx",
    "utf8",
  );

  it("explains the first move and the win condition explicitly", () => {
    expect(session).toContain("Swap adjacent tiles");
    expect(session).toContain("Match 3 or more");
    expect(session).toContain("Collect the pictured goal");
    expect(session).toContain("before your moves reach zero");
  });

  it("supports touch, keyboard, dismissal, and replay from Pause", () => {
    expect(session).toContain("Swipe one tile toward its neighbor");
    expect(session).toContain("use the arrow keys and Enter or Space");
    expect(session).toContain('aria-label="Hide how to play"');
    expect(session).toContain("How to play\n");
    expect(session).toContain("writeSevenDaysTutorialSeen");
  });

  it("returns focus and announces the right next step for each game stage", () => {
    expect(session).toContain('id={startButtonId}');
    expect(session).toContain('document.getElementById(startButtonId)?.focus()');
    expect(session).toContain(
      '"How to play closed. Start the level when you are ready."',
    );
    expect(session).toContain('pauseButtonRef.current?.focus()');
    expect(session).toContain('"How to play closed. The board is ready."');
  });
});
