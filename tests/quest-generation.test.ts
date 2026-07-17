import { describe, expect, it } from "vitest";
import { seedQuests } from "@/data/seed/quests";
import { createReviewedQuestProvider } from "@/lib/quest-generation/provider";
import type { QuestDuration } from "@/lib/questos/types";

describe("reviewed quest generation", () => {
  it("advances to another match when the catalog has multiple options", async () => {
    const provider = createReviewedQuestProvider(seedQuests);
    const first = await provider.generate({ category: "service", variation: 1 });
    const second = await provider.generate({ category: "service", variation: 2 });

    expect(first.quest.category).toBe("service");
    expect(second.quest.category).toBe("service");
    expect(second.quest.slug).not.toBe(first.quest.slug);
  });

  it("discloses when an unavailable preference has to be relaxed", async () => {
    const durations: QuestDuration[] = [5, 10, 15, 30, 60, 240, 480];
    const unavailableDuration = durations.find(
      (duration) =>
        !seedQuests.some(
          (quest) =>
            quest.category === "prayer" && quest.durationMinutes === duration
        )
    );
    expect(unavailableDuration).toBeDefined();

    const provider = createReviewedQuestProvider(seedQuests);
    const result = await provider.generate({
      category: "prayer",
      duration: unavailableDuration,
      variation: 1,
    });

    expect(result.quest.category).toBe("prayer");
    expect(result.quest.durationMinutes).not.toBe(unavailableDuration);
    expect(result.notice).toContain("No exact match");
  });

  it("fails clearly instead of returning an undefined quest from an empty catalog", async () => {
    const provider = createReviewedQuestProvider([]);
    await expect(provider.generate({ variation: 1 })).rejects.toThrow(
      "reviewed quest catalog is empty"
    );
  });
});
