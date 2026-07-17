import { describe, expect, it } from "vitest";
import {
  questChecklists,
} from "@/data/seed/quest-checklists";
import { questBySlug, seedQuests } from "@/data/seed/quests";
import { QUEST_STEP_KEYS } from "@/lib/questos/types";

const REPRESENTATIVE_EXPANSION_SLUGS = [
  "pray-the-examen-before-sleep",
  "compare-two-resurrection-accounts",
  "serve-a-local-need-with-consent",
  "commit-to-a-month-of-service",
  "write-a-sabbath-plan",
  "record-a-family-faith-story",
  "attend-a-community-meeting",
  "draft-a-rule-of-life",
] as const;

describe("curated quest checklists", () => {
  it("uses two to four valid, unique keys with useful nonblank labels", () => {
    const validKeys = new Set<string>(QUEST_STEP_KEYS);
    const catalogSlugs = new Set(seedQuests.map((quest) => quest.slug));

    expect(Object.keys(questChecklists).length).toBeGreaterThanOrEqual(12);
    for (const [slug, checklist] of Object.entries(questChecklists)) {
      expect(catalogSlugs.has(slug), `unknown checklist quest: ${slug}`).toBe(true);
      expect(checklist.length, slug).toBeGreaterThanOrEqual(2);
      expect(checklist.length, slug).toBeLessThanOrEqual(4);

      const keys = checklist.map((item) => item.key);
      expect(new Set(keys).size, `${slug}: duplicate checklist key`).toBe(
        keys.length,
      );
      for (const item of checklist) {
        expect(validKeys.has(item.key), `${slug}: invalid key ${item.key}`).toBe(
          true,
        );
        expect(item.label, `${slug}: blank label`).toBe(item.label.trim());
        expect(item.label.length, `${slug}: label lacks useful detail`).toBeGreaterThan(
          12,
        );
      }
    }
  });

  it("hydrates every curated checklist onto its seed quest", () => {
    const hydrated = seedQuests.filter((quest) => quest.checklist?.length);
    expect(hydrated.length).toBeGreaterThanOrEqual(
      Object.keys(questChecklists).length,
    );

    for (const [slug, checklist] of Object.entries(questChecklists)) {
      expect(questBySlug.get(slug)?.checklist, slug).toEqual(checklist);
    }
  });

  it("covers the named prayer quest and representative expansion quests", () => {
    expect(
      questBySlug.get("pray-for-three-people-by-name")?.checklist,
    ).toEqual(questChecklists["pray-for-three-people-by-name"]);

    for (const slug of REPRESENTATIVE_EXPANSION_SLUGS) {
      expect(questBySlug.get(slug)?.checklist?.length, slug).toBeGreaterThanOrEqual(
        2,
      );
    }
  });
});
