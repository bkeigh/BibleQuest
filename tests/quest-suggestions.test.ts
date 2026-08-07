import { describe, expect, it } from "vitest";
import {
  filterQuests,
  formatQuestWindowRemaining,
  interleaveByCategory,
  nextQuestSlotAt,
  normalizeAssignmentWindow,
  QUEST_WINDOW_MS,
  questWindowExpiresAt,
  selectSuggestedQuests,
} from "@/lib/questos/quest-engine";
import {
  DEFAULT_SETTINGS,
  type DailyQuestAssignment,
  type Profile,
  type QuestTemplate,
  type Settings,
} from "@/lib/questos/types";
import { seedQuests } from "@/data/seed/quests";

const NOW = Date.parse("2026-07-16T12:00:00.000Z");

function quest(overrides: Partial<QuestTemplate> & { slug: string }): QuestTemplate {
  return {
    title: `Quest ${overrides.slug}`,
    category: "prayer",
    durationMinutes: 10,
    difficulty: "gentle",
    energyLevel: "low",
    soloOrSocial: "solo",
    indoorOrOutdoor: "indoor",
    invitation: "Take one small step.",
    whyItMatters: "Because small steps are steps.",
    scriptureReference: "Psalm 1:1",
    reflectionPrompt: "What did you notice?",
    prayerPrompt: "Speak plainly.",
    growthType: "roots",
    tags: [],
    seasonTags: [],
    traditionTags: [],
    sensitivityTags: [],
    isPremium: false,
    ...overrides,
  };
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

const profile: Profile = {
  displayName: "Fixture Person",
  onboardingCompleted: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function assignment(
  overrides: Partial<DailyQuestAssignment> = {},
): DailyQuestAssignment {
  return {
    dateKey: "2026-07-16",
    questSlug: "fixture-walk",
    status: "assigned",
    pickedAt: "2026-07-16T12:00:00.000Z",
    expiresAt: "2026-07-17T12:00:00.000Z",
    rerolls: 0,
    ...overrides,
  };
}

describe("normalizeAssignmentWindow", () => {
  it("returns the same reference when the window is already coherent", () => {
    const existing = assignment();
    expect(normalizeAssignmentWindow(existing)).toBe(existing);
  });

  it("backfills a missing window from startedAt, then completedAt", () => {
    const started = normalizeAssignmentWindow({
      ...assignment({ status: "started" }),
      pickedAt: "",
      expiresAt: "",
      startedAt: "2026-07-16T06:00:00.000Z",
    });
    expect(started.pickedAt).toBe("2026-07-16T06:00:00.000Z");
    expect(Date.parse(started.expiresAt) - Date.parse(started.pickedAt)).toBe(
      QUEST_WINDOW_MS,
    );

    const completed = normalizeAssignmentWindow({
      ...assignment({ status: "completed" }),
      pickedAt: "",
      expiresAt: "",
      completedAt: "2026-07-16T07:30:00.000Z",
    });
    expect(completed.pickedAt).toBe("2026-07-16T07:30:00.000Z");
  });

  it("falls back to the legacy calendar day when no timestamp survives", () => {
    const legacy = normalizeAssignmentWindow({
      ...assignment(),
      pickedAt: "",
      expiresAt: "",
    });
    expect(legacy.pickedAt).toBe(
      new Date("2026-07-16T00:00:00").toISOString(),
    );
  });

  it("ignores unparseable timestamps and never expires before the pick", () => {
    const repaired = normalizeAssignmentWindow(
      assignment({ pickedAt: "not-a-date", expiresAt: "not-a-date" }),
    );
    expect(Number.isFinite(Date.parse(repaired.pickedAt))).toBe(true);
    expect(Date.parse(repaired.expiresAt)).toBeGreaterThan(
      Date.parse(repaired.pickedAt),
    );

    const backwards = normalizeAssignmentWindow(
      assignment({ expiresAt: "2026-07-15T12:00:00.000Z" }),
    );
    expect(backwards.expiresAt).toBe(backwards.pickedAt);
    expect(questWindowExpiresAt(backwards)).toBe(
      Date.parse(backwards.pickedAt),
    );
  });
});

describe("formatQuestWindowRemaining", () => {
  it("rounds up to whole minutes, then whole hours", () => {
    expect(formatQuestWindowRemaining("2026-07-16T12:00:30.000Z", NOW)).toBe(
      "1 min left",
    );
    expect(formatQuestWindowRemaining("2026-07-16T12:45:00.000Z", NOW)).toBe(
      "45 min left",
    );
    expect(formatQuestWindowRemaining("2026-07-16T13:00:00.000Z", NOW)).toBe(
      "1 hr left",
    );
    expect(formatQuestWindowRemaining("2026-07-16T14:30:00.000Z", NOW)).toBe(
      "3 hr left",
    );
  });

  it("reads as ended once the window closes", () => {
    expect(formatQuestWindowRemaining("2026-07-16T12:00:00.000Z", NOW)).toBe(
      "Window ended",
    );
    expect(
      formatQuestWindowRemaining("2026-07-16T11:00:00.000Z", new Date(NOW)),
    ).toBe("Window ended");
  });
});

describe("nextQuestSlotAt", () => {
  it("never promises a slot time, for Plus or free members", () => {
    const full = Object.fromEntries(
      ["a", "b", "c"].map((slug) => [
        slug,
        [assignment({ questSlug: slug, dateKey: "2026-07-16" })],
      ]),
    );
    expect(nextQuestSlotAt(full, true, NOW)).toBeNull();
    expect(nextQuestSlotAt(full, false, NOW)).toBeNull();
    expect(nextQuestSlotAt({}, false, NOW)).toBeNull();
  });
});

describe("filterQuests", () => {
  const catalogue = [
    quest({
      slug: "silent-morning",
      category: "silence",
      durationMinutes: 5,
      energyLevel: "low",
      soloOrSocial: "solo",
      indoorOrOutdoor: "indoor",
      tags: ["quiet"],
    }),
    quest({
      slug: "walk-and-thank",
      category: "gratitude",
      durationMinutes: 30,
      energyLevel: "medium",
      soloOrSocial: "either",
      indoorOrOutdoor: "outdoor",
      tags: ["walking"],
      invitation: "Walk and give thanks.",
    }),
    quest({
      slug: "serve-a-neighbor",
      category: "service",
      durationMinutes: 30,
      energyLevel: "high",
      soloOrSocial: "social",
      indoorOrOutdoor: "either",
      tags: ["neighbor"],
    }),
  ];

  it("returns everything when no filter is set", () => {
    expect(filterQuests(catalogue, {})).toHaveLength(3);
    expect(filterQuests(catalogue, { durations: [], categories: [] })).toHaveLength(
      3,
    );
  });

  it("filters by duration, category, and energy", () => {
    expect(
      filterQuests(catalogue, { durations: [5] }).map((q) => q.slug),
    ).toEqual(["silent-morning"]);
    expect(
      filterQuests(catalogue, { categories: ["service", "silence"] }).map(
        (q) => q.slug,
      ),
    ).toEqual(["silent-morning", "serve-a-neighbor"]);
    expect(
      filterQuests(catalogue, { energy: ["high"] }).map((q) => q.slug),
    ).toEqual(["serve-a-neighbor"]);
  });

  it("keeps 'either' quests whichever company or place is asked for", () => {
    expect(
      filterQuests(catalogue, { soloOrSocial: "solo" }).map((q) => q.slug),
    ).toEqual(["silent-morning", "walk-and-thank"]);
    expect(
      filterQuests(catalogue, { indoorOrOutdoor: "outdoor" }).map((q) => q.slug),
    ).toEqual(["walk-and-thank", "serve-a-neighbor"]);
    expect(
      filterQuests(catalogue, {
        soloOrSocial: "either",
        indoorOrOutdoor: "either",
      }),
    ).toHaveLength(3);
  });

  it("searches title, invitation, category, and tags case-insensitively", () => {
    expect(filterQuests(catalogue, { search: "WALK" }).map((q) => q.slug)).toEqual(
      ["walk-and-thank"],
    );
    expect(
      filterQuests(catalogue, { search: "neighbor" }).map((q) => q.slug),
    ).toEqual(["serve-a-neighbor"]);
    expect(filterQuests(catalogue, { search: "silence" }).map((q) => q.slug)).toEqual(
      ["silent-morning"],
    );
    expect(filterQuests(catalogue, { search: "nothing-here" })).toEqual([]);
  });

  it("combines filters as an AND", () => {
    expect(
      filterQuests(catalogue, {
        durations: [30],
        soloOrSocial: "social",
        search: "neighbor",
      }).map((q) => q.slug),
    ).toEqual(["serve-a-neighbor"]);
  });
});

describe("selectSuggestedQuests", () => {
  const base = {
    quests: seedQuests,
    dateKey: "2026-07-16",
    profile,
    settings: settings(),
    season: "ordinary_time" as const,
    recentSlugs: [],
  };

  it("is deterministic for the same profile and day, and holds distinct quests", () => {
    const first = selectSuggestedQuests(base);
    const second = selectSuggestedQuests(base);
    expect(first).toHaveLength(3);
    expect(second.map((q) => q.slug)).toEqual(first.map((q) => q.slug));
    expect(new Set(first.map((q) => q.slug)).size).toBe(first.length);
  });

  it("changes with the day", () => {
    const monday = selectSuggestedQuests(base).map((q) => q.slug);
    const laterKeys = ["2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20"];
    const differs = laterKeys.some(
      (dateKey) =>
        selectSuggestedQuests({ ...base, dateKey }).map((q) => q.slug).join() !==
        monday.join(),
    );
    expect(differs).toBe(true);
  });

  it("never suggests premium or excluded quests", () => {
    const catalogue = [
      quest({ slug: "free-one" }),
      quest({ slug: "free-two" }),
      quest({ slug: "premium-one", isPremium: true }),
    ];
    const picked = selectSuggestedQuests({
      ...base,
      quests: catalogue,
      excludeSlugs: ["free-two"],
    });
    expect(picked.map((q) => q.slug)).toEqual(["free-one"]);
  });

  it("returns nothing when the catalogue has no eligible quest", () => {
    expect(
      selectSuggestedQuests({ ...base, quests: [] }),
    ).toEqual([]);
    expect(
      selectSuggestedQuests({
        ...base,
        quests: [quest({ slug: "premium-only", isPremium: true })],
      }),
    ).toEqual([]);
  });

  it("honors the requested count and stops at the catalogue size", () => {
    const catalogue = [quest({ slug: "one" }), quest({ slug: "two" })];
    expect(
      selectSuggestedQuests({ ...base, quests: catalogue, count: 1 }),
    ).toHaveLength(1);
    expect(
      selectSuggestedQuests({ ...base, quests: catalogue, count: 5 }),
    ).toHaveLength(2);
  });

  it("prefers the settings' category preference over an unrelated one", () => {
    const catalogue = [
      quest({ slug: "preferred", category: "service", durationMinutes: 30 }),
      quest({ slug: "other", category: "patience", durationMinutes: 30 }),
      quest({ slug: "other-two", category: "patience", durationMinutes: 30 }),
      quest({ slug: "other-three", category: "patience", durationMinutes: 30 }),
    ];
    const picked = selectSuggestedQuests({
      ...base,
      quests: catalogue,
      settings: settings({ questCategoryPreference: ["service"] }),
      count: 1,
    });
    expect(picked.map((q) => q.slug)).toEqual(["preferred"]);
  });

  it("prefers the profile's quest style affinity", () => {
    const catalogue = [
      quest({ slug: "quiet-fit", category: "silence", durationMinutes: 30 }),
      quest({ slug: "loud-one", category: "community", durationMinutes: 30 }),
      quest({ slug: "loud-two", category: "community", durationMinutes: 30 }),
      quest({ slug: "loud-three", category: "community", durationMinutes: 30 }),
    ];
    const picked = selectSuggestedQuests({
      ...base,
      quests: catalogue,
      profile: { ...profile, questStyle: "quiet" },
      count: 1,
    });
    expect(picked.map((q) => q.slug)).toEqual(["quiet-fit"]);
  });

  it("treats 'surprise' style as no affinity at all", () => {
    const catalogue = [
      quest({ slug: "a", category: "silence", durationMinutes: 30 }),
      quest({ slug: "b", category: "community", durationMinutes: 30 }),
    ];
    const surprise = selectSuggestedQuests({
      ...base,
      quests: catalogue,
      profile: { ...profile, questStyle: "surprise" },
    });
    const guest = selectSuggestedQuests({
      ...base,
      quests: catalogue,
      profile: null,
    });
    expect(surprise).toHaveLength(2);
    expect(new Set(guest.map((q) => q.slug))).toEqual(
      new Set(surprise.map((q) => q.slug)),
    );
  });

  it("nudges toward the season outside Ordinary Time", () => {
    const catalogue = [
      quest({ slug: "lenten", durationMinutes: 30, seasonTags: ["lent"] }),
      quest({ slug: "plain-one", durationMinutes: 30 }),
      quest({ slug: "plain-two", durationMinutes: 30 }),
      quest({ slug: "plain-three", durationMinutes: 30 }),
    ];
    expect(
      selectSuggestedQuests({
        ...base,
        quests: catalogue,
        season: "lent",
        count: 1,
      }).map((q) => q.slug),
    ).toEqual(["lenten"]);
  });

  it("pushes recently completed quests to the back", () => {
    const catalogue = [
      quest({ slug: "fresh", durationMinutes: 30 }),
      quest({ slug: "just-done", durationMinutes: 30 }),
    ];
    expect(
      selectSuggestedQuests({
        ...base,
        quests: catalogue,
        recentSlugs: ["just-done"],
        count: 1,
      }).map((q) => q.slug),
    ).toEqual(["fresh"]);
  });

  it("only remembers the last fourteen recent quests", () => {
    const catalogue = [
      quest({ slug: "long-ago", durationMinutes: 30 }),
      quest({ slug: "alternative", durationMinutes: 30 }),
    ];
    const recentSlugs = [
      "long-ago",
      ...Array.from({ length: 14 }, (_, index) => `filler-${index}`),
    ];
    expect(
      selectSuggestedQuests({
        ...base,
        quests: catalogue,
        recentSlugs,
        count: 2,
      }).map((q) => q.slug).sort(),
    ).toEqual(["alternative", "long-ago"]);
  });
});

describe("interleaveByCategory", () => {
  it("puts one of every category in the opening rows", () => {
    // The seed file is grouped by category, which is what made the first
    // twenty-four of one hundred and fifty read as four categories.
    const grouped = [
      ...Array.from({ length: 6 }, (_, i) =>
        quest({ slug: `prayer-${i}`, category: "prayer" }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        quest({ slug: `silence-${i}`, category: "silence" }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        quest({ slug: `service-${i}`, category: "service" }),
      ),
    ];
    expect(new Set(grouped.slice(0, 3).map((q) => q.category)).size).toBe(1);

    const ordered = interleaveByCategory(grouped);
    expect(ordered.slice(0, 3).map((q) => q.category)).toEqual([
      "prayer",
      "silence",
      "service",
    ]);
  });

  it("preserves every quest exactly once and keeps lane order", () => {
    const input = [
      quest({ slug: "a1", category: "prayer" }),
      quest({ slug: "b1", category: "silence" }),
      quest({ slug: "a2", category: "prayer" }),
      quest({ slug: "a3", category: "prayer" }),
    ];
    const ordered = interleaveByCategory(input);
    expect(ordered).toHaveLength(input.length);
    expect(ordered.map((q) => q.slug).sort()).toEqual(["a1", "a2", "a3", "b1"]);
    // Within a category, first-appearance order survives.
    expect(
      ordered.filter((q) => q.category === "prayer").map((q) => q.slug),
    ).toEqual(["a1", "a2", "a3"]);
  });

  it("returns an empty list unchanged rather than looping on -Infinity", () => {
    expect(interleaveByCategory([])).toEqual([]);
  });

  it("leaves the real catalogue length untouched", () => {
    const open = seedQuests.filter((q) => !q.isPremium);
    const ordered = interleaveByCategory(open);
    expect(ordered).toHaveLength(open.length);
    // The whole point: the opening screen shows the range of the library.
    expect(new Set(ordered.slice(0, 10).map((q) => q.category)).size).toBe(10);
  });
});
