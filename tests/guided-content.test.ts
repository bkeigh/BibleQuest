import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dailyGuidedScripture,
  guidedPracticeById,
  guidedScriptureForDate,
  pilgrimages,
} from "@/data/guided/content";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import { reflectionPrompts } from "@/data/seed/reflection-prompts";
import { questBySlug } from "@/data/seed/quests";
import { movementsForPractice } from "@/lib/guided/types";
import {
  GUIDED_MOVEMENT_KEYS,
  type GuidedMovementKey,
} from "@/lib/questos/types";
import { isGuidedContentId } from "@/lib/guided/progress";

const ROOT = process.cwd();
const practices = [
  ...dailyGuidedScripture,
  ...pilgrimages.flatMap((pilgrimage) => pilgrimage.days),
];

/** Load one bundled public-domain book exactly as the server reader does. */
function bundledVerses(
  bookSlug: string,
  chapter: number,
  verseStart: number,
  verseEnd: number,
): string[] {
  const book = JSON.parse(
    readFileSync(
      join(ROOT, "src", "data", "bible", `${bookSlug}.json`),
      "utf8",
    ),
  ) as { chapters: string[][] };
  return book.chapters[chapter - 1].slice(verseStart - 1, verseEnd);
}

describe("reviewed Guided Scripture content", () => {
  it("ships one free guide per day and exactly one Free and one Plus path", () => {
    expect(dailyGuidedScripture).toHaveLength(7);
    expect(dailyGuidedScripture.every((guide) => guide.access === "free")).toBe(
      true,
    );
    expect(pilgrimages.map((path) => path.access)).toEqual(["free", "plus"]);
    expect(pilgrimages[0].days).toHaveLength(7);
    expect(pilgrimages[1].days).toHaveLength(5);
    for (const pilgrimage of pilgrimages) {
      expect(
        pilgrimage.days.every((day) => day.access === pilgrimage.access),
      ).toBe(true);
      expect(pilgrimage.estimatedDays).toBe(pilgrimage.days.length);
    }

    const today = guidedScriptureForDate("2026-07-29");
    expect(dailyGuidedScripture).toContain(today);
    expect(guidedScriptureForDate("2026-07-29")).toBe(today);
  });

  it("walks every daily guide once in each seven-day rotation", () => {
    const rotation = Array.from({ length: 7 }, (_, offset) =>
      guidedScriptureForDate(`2026-08-${String(offset + 1).padStart(2, "0")}`),
    );

    expect(new Set(rotation)).toEqual(new Set(dailyGuidedScripture));
    expect(() => guidedScriptureForDate("2026-02-30")).toThrow(
      "Invalid local date key",
    );
  });

  it("uses unique, stable versioned ids and the six canonical movements", () => {
    const ids = [
      ...practices.map((practice) => practice.id),
      ...pilgrimages.map((pilgrimage) => pilgrimage.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isGuidedContentId)).toBe(true);

    for (const practice of practices) {
      expect(
        movementsForPractice(practice).map(
          (movement) => movement.key,
        ) as GuidedMovementKey[],
      ).toEqual([...GUIDED_MOVEMENT_KEYS]);
    }
  });

  it("matches every displayed verse exactly to the bundled WEB source", () => {
    for (const practice of practices) {
      const passage = practice.scripture;
      expect(passage.translationKey).toBe("web");
      expect(passage.translationLabel).toBe("World English Bible (WEB)");
      expect(passage.verses).toEqual(
        bundledVerses(
          passage.bookSlug,
          passage.chapter,
          passage.verseStart,
          passage.verseEnd,
        ),
      );
      expect(passage.verses).toHaveLength(
        passage.verseEnd - passage.verseStart + 1,
      );
    }
  });

  it("links only reviewed prompts and existing static quest content", () => {
    const reflectionIds = new Set(reflectionPrompts.map(({ id }) => id));
    const prayerIds = new Set(prayerPrompts.map(({ id }) => id));
    for (const practice of practices) {
      expect(reflectionIds.has(practice.reflectionPromptId)).toBe(true);
      expect(prayerIds.has(practice.prayerPromptId)).toBe(true);
      expect(questBySlug.has(practice.questSlug)).toBe(true);
      expect(practice.review).toEqual({
        status: "reviewed",
        reviewedAt: "2026-07-29",
        lenses: ["safety", "tone", "theology"],
        scriptureSource: "bundled_web",
      });
      expect(guidedPracticeById.get(practice.id)).toBe(practice);
    }
    expect(guidedPracticeById.size).toBe(practices.length);
  });

  it("keeps daily handoffs free and the Free Pilgrimage especially gentle", () => {
    const freePath = pilgrimages.find(
      (pilgrimage) => pilgrimage.access === "free",
    )!;

    for (const practice of dailyGuidedScripture) {
      const quest = questBySlug.get(practice.questSlug)!;
      expect(quest.isPremium, practice.questSlug).toBe(false);
      expect(quest.durationMinutes, practice.questSlug).toBeLessThanOrEqual(15);
      expect(practice.durationMinutes, practice.id).toBeLessThanOrEqual(15);
    }

    for (const practice of freePath.days) {
      const quest = questBySlug.get(practice.questSlug)!;
      expect(quest.isPremium, practice.questSlug).toBe(false);
      expect(quest.durationMinutes, practice.questSlug).toBeLessThanOrEqual(15);
      expect(quest.difficulty, practice.questSlug).toBe("gentle");
      expect(quest.energyLevel, practice.questSlug).toBe("low");
      expect(practice.durationMinutes, practice.id).toBeLessThanOrEqual(15);
    }
  });

  it("keeps content calm, noncompetitive, and free of runtime AI claims", () => {
    const copy = JSON.stringify({ dailyGuidedScripture, pilgrimages }).toLowerCase();
    for (const forbidden of [
      "streak",
      "leaderboard",
      "level up",
      "don't lose",
      "god is disappointed",
      "prove your faith",
      "generated by ai",
      "ai says",
    ]) {
      expect(copy).not.toContain(forbidden);
    }
  });
});
