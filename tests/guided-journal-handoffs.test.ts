import { describe, expect, it } from "vitest";
import {
  dailyGuidedScripture,
  pilgrimages,
} from "@/data/guided/content";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import { selectReflectionPrompts } from "@/lib/journal/reflection-prompts";
import { guidedJournalHandoff } from "@/lib/guided/journal-handoff";

// One catalog proves every authored guide reaches its exact reviewed fallback.
const practices = [
  ...dailyGuidedScripture,
  ...pilgrimages.flatMap((pilgrimage) => pilgrimage.days),
];

describe("guided journal handoffs", () => {
  it("honors every requested reflection prompt even with Scripture context", () => {
    for (const practice of practices) {
      const selection = selectReflectionPrompts(
        practice.scripture.reference,
        practice.reflectionPromptId,
      );
      expect(
        selection.requestedPrompt?.id,
        `${practice.id} reflection prompt`,
      ).toBe(practice.reflectionPromptId);
      expect(selection.promptPool[0]?.id).toBe(practice.reflectionPromptId);
    }
  });

  it("resolves every prayer fallback to reviewed static content", () => {
    const prayerIds = new Set(prayerPrompts.map((prompt) => prompt.id));
    for (const practice of practices) {
      expect(
        prayerIds.has(practice.prayerPromptId),
        `${practice.id} prayer prompt`,
      ).toBe(true);
    }
  });

  it("carries exact authored guide copy through stable journal ids", () => {
    for (const practice of practices) {
      expect(guidedJournalHandoff(practice.id)).toMatchObject({
        practiceId: practice.id,
        title: practice.title,
        verseReference: practice.scripture.reference,
        reflectionPrompt: practice.reflect,
        prayerBody: practice.prayer,
      });
    }
    expect(guidedJournalHandoff("guide.unknown.v1")).toBeNull();
  });
});
