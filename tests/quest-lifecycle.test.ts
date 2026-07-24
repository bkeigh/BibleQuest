import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedQuests } from "@/data/seed/quests";
import {
  activeQuestAssignments,
  occupiedQuestAssignments,
  QUEST_PICK_UNDO_MS,
  QUEST_WINDOW_MS,
  questSlotsRemaining,
} from "@/lib/questos/quest-engine";
import {
  checklistItemsForQuest,
  isQuestChecklistComplete,
} from "@/lib/questos/quest-steps";
import { useQuestOS } from "@/lib/questos/store";

const START = new Date("2026-07-16T23:30:00.000Z");
const slugs = seedQuests.slice(0, 8).map((quest) => quest.slug);

function markRequiredChecklist(slug: string): void {
  const quest = seedQuests.find((candidate) => candidate.slug === slug);
  if (!quest) throw new Error(`Missing test quest: ${slug}`);
  for (const item of checklistItemsForQuest(quest)) {
    useQuestOS.getState().markQuestStep(slug, item.key);
  }
}

describe("quest checklist helpers", () => {
  it("keeps generic walk steps optional when no checklist is declared", () => {
    const quest = { ...seedQuests[0], checklist: undefined };
    expect(checklistItemsForQuest(quest)).toEqual([]);
    expect(isQuestChecklistComplete(quest, null)).toBe(true);
    expect(
      isQuestChecklistComplete(quest, { stepsDone: ["scripture"] })
    ).toBe(true);
  });

  it("requires every declared key while ignoring unrelated generic steps", () => {
    const quest = {
      ...seedQuests[0],
      checklist: [
        { key: "scripture" as const, label: "Read the passage" },
        { key: "live" as const, label: "Practice the invitation" },
      ],
    };
    expect(isQuestChecklistComplete(quest, null)).toBe(false);
    expect(
      isQuestChecklistComplete(quest, {
        stepsDone: ["scripture", "reflect", "pray"],
      })
    ).toBe(false);
    expect(
      isQuestChecklistComplete(quest, { stepsDone: ["scripture", "live"] })
    ).toBe(true);
  });
});

describe("rolling quest lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    useQuestOS.getState().clearAllData();
  });

  it("enforces three concurrent free slots for exactly 24 hours", () => {
    expect(useQuestOS.getState().pickQuest(slugs[0])).toBe(true);
    expect(useQuestOS.getState().pickQuest(slugs[1])).toBe(true);
    expect(useQuestOS.getState().pickQuest(slugs[2])).toBe(true);
    expect(useQuestOS.getState().pickQuest(slugs[3])).toBe(false);

    vi.setSystemTime(new Date(START.getTime() + QUEST_WINDOW_MS - 1));
    expect(useQuestOS.getState().pickQuest(slugs[3])).toBe(false);
    vi.setSystemTime(new Date(START.getTime() + QUEST_WINDOW_MS));
    expect(useQuestOS.getState().pickQuest(slugs[3])).toBe(true);
  });

  it("gives Plus unlimited windows without changing the static catalog", () => {
    for (const slug of slugs) {
      expect(useQuestOS.getState().pickQuest(slug, true)).toBe(true);
    }
    expect(activeQuestAssignments(useQuestOS.getState().assignments)).toHaveLength(
      slugs.length,
    );
    expect(questSlotsRemaining(useQuestOS.getState().assignments, true)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("makes Begin atomic and completion idempotent inside its window", () => {
    expect(useQuestOS.getState().startQuest(slugs[0])).toBe(true);
    const [started] = activeQuestAssignments(useQuestOS.getState().assignments);
    expect(started.status).toBe("started");
    expect(started.expiresAt).toBe(
      new Date(START.getTime() + QUEST_WINDOW_MS).toISOString(),
    );

    markRequiredChecklist(slugs[0]);
    const first = useQuestOS.getState().completeQuestBySlug(slugs[0]);
    const second = useQuestOS.getState().completeQuestBySlug(slugs[0]);
    expect(first.completed).toBe(true);
    expect(second).toMatchObject({
      completed: false,
      reason: "already_completed",
    });
    expect(useQuestOS.getState().completions).toHaveLength(1);
    expect(activeQuestAssignments(useQuestOS.getState().assignments)[0].status).toBe(
      "completed",
    );
    // Completion keeps the free reservation until its promised reset.
    expect(questSlotsRemaining(useQuestOS.getState().assignments, false)).toBe(2);
  });

  it("completes a cross-midnight quest on the original assignment row", () => {
    expect(useQuestOS.getState().startQuest(slugs[0])).toBe(true);
    const originalDay = Object.keys(useQuestOS.getState().assignments)[0];
    vi.setSystemTime(new Date(START.getTime() + 2 * 60 * 60 * 1000));

    markRequiredChecklist(slugs[0]);
    expect(useQuestOS.getState().completeQuestBySlug(slugs[0]).completed).toBe(true);
    expect(useQuestOS.getState().assignments[originalDay][0].status).toBe(
      "completed",
    );
    expect(useQuestOS.getState().assignments[originalDay][0].completedAt).toBeTruthy();
  });

  it("allows a short accidental-tap undo, then preserves the free reservation", () => {
    expect(useQuestOS.getState().pickQuest(slugs[0])).toBe(true);
    useQuestOS.getState().unpickQuest(slugs[0]);
    expect(occupiedQuestAssignments(useQuestOS.getState().assignments)).toHaveLength(0);

    expect(useQuestOS.getState().pickQuest(slugs[0])).toBe(true);
    vi.setSystemTime(new Date(START.getTime() + QUEST_PICK_UNDO_MS + 1));
    useQuestOS.getState().unpickQuest(slugs[0]);
    expect(activeQuestAssignments(useQuestOS.getState().assignments)).toHaveLength(0);
    expect(occupiedQuestAssignments(useQuestOS.getState().assignments)).toHaveLength(1);
    expect(questSlotsRemaining(useQuestOS.getState().assignments, false)).toBe(2);

    expect(useQuestOS.getState().pickQuest(slugs[1])).toBe(true);
    expect(useQuestOS.getState().pickQuest(slugs[2])).toBe(true);
    expect(useQuestOS.getState().pickQuest(slugs[3])).toBe(false);

    // Returning to the hidden quest reuses its reservation, not another slot.
    expect(useQuestOS.getState().startQuest(slugs[0])).toBe(true);
    expect(occupiedQuestAssignments(useQuestOS.getState().assignments)).toHaveLength(3);
  });

  it("lets Plus release a window immediately", () => {
    expect(useQuestOS.getState().pickQuest(slugs[0], true)).toBe(true);
    vi.setSystemTime(new Date(START.getTime() + QUEST_PICK_UNDO_MS + 1));
    useQuestOS.getState().unpickQuest(slugs[0], true);
    expect(occupiedQuestAssignments(useQuestOS.getState().assignments)).toHaveLength(0);
  });

  it("keeps an expired walk on the shelf and opens a fresh window to continue", () => {
    expect(useQuestOS.getState().startQuest(slugs[0])).toBe(true);
    useQuestOS.getState().markQuestStep(slugs[0], "scripture");
    vi.setSystemTime(new Date(START.getTime() + QUEST_WINDOW_MS + 1));

    expect(activeQuestAssignments(useQuestOS.getState().assignments)).toHaveLength(0);
    expect(useQuestOS.getState().myQuests[slugs[0]].stepsDone).toEqual([
      "scripture",
    ]);
    expect(useQuestOS.getState().startQuest(slugs[0])).toBe(true);
    expect(useQuestOS.getState().myQuests[slugs[0]].stepsDone).toEqual([
      "scripture",
    ]);
  });

  it("requires a started assignment and a declared checklist before completion", () => {
    const quest = seedQuests.find(
      (candidate) => candidate.slug === "pray-for-three-people-by-name"
    );
    if (!quest?.checklist?.length) {
      throw new Error("Expected the named prayer quest to have a checklist");
    }
    const concurrentSlug = slugs.find((slug) => slug !== quest.slug);
    if (!concurrentSlug) throw new Error("Missing concurrent test quest");

    expect(useQuestOS.getState().pickQuest(quest.slug)).toBe(true);
    expect(useQuestOS.getState().completeQuestBySlug(quest.slug)).toMatchObject({
      completed: false,
      reason: "not_started",
    });

    expect(useQuestOS.getState().startQuest(quest.slug)).toBe(true);
    expect(useQuestOS.getState().startQuest(concurrentSlug)).toBe(true);
    expect(useQuestOS.getState().completeQuestBySlug(quest.slug)).toMatchObject({
      completed: false,
      reason: "checklist_incomplete",
    });

    useQuestOS.getState().markQuestStep(quest.slug, quest.checklist[0].key);
    expect(useQuestOS.getState().completeQuestBySlug(quest.slug)).toMatchObject({
      completed: false,
      reason: "checklist_incomplete",
    });

    for (const item of quest.checklist.slice(1)) {
      useQuestOS.getState().markQuestStep(quest.slug, item.key);
    }
    const finalItem = quest.checklist.at(-1);
    if (!finalItem) throw new Error("Missing final checklist item");
    useQuestOS.getState().markQuestStep(quest.slug, finalItem.key, false);
    expect(useQuestOS.getState().completeQuestBySlug(quest.slug)).toMatchObject({
      completed: false,
      reason: "checklist_incomplete",
    });
    useQuestOS.getState().markQuestStep(quest.slug, finalItem.key);
    expect(useQuestOS.getState().completeQuestBySlug(quest.slug).completed).toBe(
      true
    );

    // Completing this walk must not disturb another concurrent active quest.
    expect(useQuestOS.getState().myQuests[concurrentSlug].status).toBe("active");
    expect(
      activeQuestAssignments(useQuestOS.getState().assignments).find(
        (assignment) => assignment.questSlug === concurrentSlug
      )?.status
    ).toBe("started");
  });

  it("returns explicit failure reasons for unknown and expired quests", () => {
    expect(useQuestOS.getState().completeQuestBySlug("missing-quest")).toMatchObject({
      completed: false,
      reason: "unknown_quest",
    });

    expect(useQuestOS.getState().startQuest(slugs[0])).toBe(true);
    vi.setSystemTime(new Date(START.getTime() + QUEST_WINDOW_MS));
    expect(useQuestOS.getState().completeQuestBySlug(slugs[0])).toMatchObject({
      completed: false,
      reason: "window_closed",
    });
  });

  it("deduplicates recent verses by range and caps history at twenty", () => {
    for (let verse = 1; verse <= 21; verse += 1) {
      useQuestOS.getState().recordRecentVerse({
        bookSlug: "john",
        bookName: "John",
        chapter: 1,
        verseStart: verse,
        verseEnd: verse,
        reference: `John 1:${verse}`,
        text: `Verse ${verse}`,
      });
      vi.advanceTimersByTime(1_000);
    }
    useQuestOS.getState().recordRecentVerse({
      bookSlug: "john",
      bookName: "John",
      chapter: 1,
      verseStart: 10,
      verseEnd: 10,
      reference: "John 1:10",
      text: "Updated exact text",
    });

    const recent = useQuestOS.getState().recentVerses;
    expect(recent).toHaveLength(20);
    expect(recent[0]).toMatchObject({ reference: "John 1:10", text: "Updated exact text" });
    expect(recent.filter((verse) => verse.reference === "John 1:10")).toHaveLength(1);
  });

  it("replaces the front history entry when the displayed edition resolves", () => {
    const passage = {
      bookSlug: "john",
      bookName: "John",
      chapter: 1,
      verseStart: 1,
      verseEnd: 1,
      reference: "John 1:1",
    };

    useQuestOS.getState().recordRecentVerse({
      ...passage,
      text: "In the beginning was the Word.",
    });
    useQuestOS.getState().recordRecentVerse({
      ...passage,
      text: "In the beginning was the Word, and the Word was with God.",
    });

    expect(useQuestOS.getState().recentVerses).toHaveLength(1);
    expect(useQuestOS.getState().recentVerses[0]?.text).toBe(
      "In the beginning was the Word, and the Word was with God.",
    );
  });
});
