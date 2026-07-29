import { describe, expect, it } from "vitest";
import { seedQuests, questBySlug } from "@/data/seed/quests";
import { buildHomeQuestGroups } from "@/lib/questos/home-quest-groups";
import type {
  DailyQuestAssignment,
  DailyQuestStatus,
  MyQuest,
  MyQuestStatus,
} from "@/lib/questos/types";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");
const FUTURE = "2026-07-24T12:00:00.000Z";
const PAST = "2026-07-22T12:00:00.000Z";
const slugs = seedQuests.slice(0, 9).map((quest) => quest.slug);

/** Builds one deterministic rolling assignment fixture. */
function assignment(
  questSlug: string,
  status: DailyQuestStatus,
  expiresAt = FUTURE,
): DailyQuestAssignment {
  return {
    dateKey: "2026-07-23",
    questSlug,
    status,
    pickedAt: "2026-07-23T10:00:00.000Z",
    expiresAt,
    completedAt:
      status === "completed" ? "2026-07-23T11:00:00.000Z" : undefined,
    rerolls: 0,
  };
}

/** Builds one persistent shelf fixture with optional begun state. */
function shelf(
  questSlug: string,
  status: MyQuestStatus,
  begun = false,
  lastActivityAt = "2026-07-23T09:00:00.000Z",
): MyQuest {
  return {
    questSlug,
    status,
    addedAt: "2026-07-20T09:00:00.000Z",
    startedAt: begun ? "2026-07-21T09:00:00.000Z" : undefined,
    completedAt:
      status === "completed" || status === "archived"
        ? "2026-07-23T08:00:00.000Z"
        : undefined,
    lastActivityAt,
    stepsDone: [],
    timesCompleted: status === "completed" || status === "archived" ? 1 : 0,
  };
}

describe("Home quest groups", () => {
  it("maps rolling assignment status into Active, Ready, and Completed", () => {
    const groups = buildHomeQuestGroups({
      assignments: [
        assignment(slugs[0], "started"),
        assignment(slugs[1], "assigned"),
        assignment(slugs[2], "completed"),
      ],
      myQuests: {},
      questsBySlug: questBySlug,
      now: NOW,
    });

    expect(groups.active.map((item) => item.quest.slug)).toEqual([slugs[0]]);
    expect(groups.ready.map((item) => item.quest.slug)).toEqual([slugs[1]]);
    expect(groups.completed.map((item) => item.quest.slug)).toEqual([slugs[2]]);
  });

  it("keeps only outstanding and today-completed shelf walks on the board", () => {
    const groups = buildHomeQuestGroups({
      assignments: [],
      myQuests: {
        begun: shelf(slugs[0], "active", true),
        unbegun: shelf(slugs[1], "active"),
        saved: shelf(slugs[2], "saved"),
        paused: shelf(slugs[3], "paused", true),
        completed: shelf(slugs[4], "completed", true),
        archived: shelf(slugs[5], "archived", true),
      },
      questsBySlug: questBySlug,
      now: NOW,
    });

    expect(groups.active.map((item) => item.quest.slug)).toEqual([slugs[0]]);
    expect(groups.ready.map((item) => item.quest.slug)).toEqual([slugs[1]]);
    expect(groups.completed.map((item) => item.quest.slug)).toEqual([slugs[4]]);
  });

  it("lets a current assignment win a duplicate shelf slug", () => {
    const groups = buildHomeQuestGroups({
      assignments: [assignment(slugs[0], "assigned")],
      myQuests: {
        duplicate: shelf(slugs[0], "completed", true),
      },
      questsBySlug: questBySlug,
      now: NOW,
    });

    expect(groups.ready).toHaveLength(1);
    expect(groups.ready[0]).toMatchObject({
      kind: "assignment",
      quest: { slug: slugs[0] },
    });
    expect(groups.completed).toHaveLength(0);
  });

  it("keeps expired Active rows visible while ignoring legacy hidden rows", () => {
    const groups = buildHomeQuestGroups({
      assignments: [
        assignment(slugs[0], "released"),
        assignment(slugs[1], "started", PAST),
        assignment("missing-template", "assigned"),
      ],
      myQuests: {
        releasedFallback: shelf(slugs[0], "saved"),
        expiredFallback: shelf(slugs[1], "active", true),
        unknown: shelf("missing-template", "active", true),
      },
      questsBySlug: questBySlug,
      now: NOW,
    });

    expect(groups.ready).toHaveLength(0);
    expect(groups.active.map((item) => item.quest.slug)).toEqual([slugs[1]]);
    expect(
      [...groups.active, ...groups.ready, ...groups.completed].some(
        (item) => item.quest.slug === "missing-template",
      ),
    ).toBe(false);
  });

  it("orders shelf-only Active items by most recent activity", () => {
    const groups = buildHomeQuestGroups({
      assignments: [],
      myQuests: {
        older: shelf(slugs[0], "active", true, "2026-07-20T09:00:00.000Z"),
        newer: shelf(slugs[1], "active", true, "2026-07-22T09:00:00.000Z"),
      },
      questsBySlug: questBySlug,
      now: NOW,
    });

    expect(groups.active.map((item) => item.quest.slug)).toEqual([
      slugs[1],
      slugs[0],
    ]);
  });
});
