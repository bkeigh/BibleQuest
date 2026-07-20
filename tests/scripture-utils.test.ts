import { describe, expect, it } from "vitest";
import {
  cleanVerseText,
  formatVerseShareText,
} from "@/lib/utils/scripture";

describe("Scripture display helpers", () => {
  it("removes balanced wrapper quotes from verse text", () => {
    expect(cleanVerseText('  “Be still.”  ')).toBe("Be still.");
  });

  it("shares the verse and reference without a Bible edition", () => {
    expect(formatVerseShareText("“Be still.”", "Psalm 46:10")).toBe(
      "“Be still.” — Psalm 46:10",
    );
  });
});
