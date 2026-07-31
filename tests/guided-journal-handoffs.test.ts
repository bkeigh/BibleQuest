import { describe, expect, it } from "vitest";
import {
  dailyGuidedScripture,
  pilgrimages,
} from "@/data/guided/content";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import { selectReflectionPrompts } from "@/lib/journal/reflection-prompts";
import { guidedJournalHandoff } from "@/lib/guided/journal-handoff";
import { journalDraftStorageKey } from "@/lib/questos/journal-drafts";

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
        draftScopeId: `guided:${practice.id}`,
        title: practice.title,
        verseReference: practice.scripture.reference,
        reflectionPrompt: practice.reflect,
        prayerBody: practice.prayer,
      });
    }
    expect(guidedJournalHandoff("guide.unknown.v1")).toBeNull();
  });

  it("returns to the exact guide and isolates its unfinished journal draft", () => {
    for (const practice of dailyGuidedScripture) {
      const handoff = guidedJournalHandoff(practice.id)!;
      expect(handoff.returnPath).toBe("/app/guided/daily");
      expect(
        journalDraftStorageKey("reflection", handoff.draftScopeId),
      ).not.toBe(journalDraftStorageKey("reflection"));
    }

    for (const pilgrimage of pilgrimages) {
      pilgrimage.days.forEach((practice, index) => {
        const handoff = guidedJournalHandoff(practice.id)!;
        expect(handoff.returnPath).toBe(
          `/app/pilgrimages/${pilgrimage.slug}/${index + 1}`,
        );
      });
    }

    const first = guidedJournalHandoff(practices[0].id)!;
    const second = guidedJournalHandoff(practices[1].id)!;
    expect(
      journalDraftStorageKey("prayer", first.draftScopeId),
    ).not.toBe(journalDraftStorageKey("prayer", second.draftScopeId));
  });
});
