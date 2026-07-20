import { describe, expect, it } from "vitest";
import {
  deriveJournalTimeline,
  filterJournalEntries,
  journalExcerpt,
  toJournalEntries,
} from "@/lib/questos/journal";
import type { Prayer, Reflection } from "@/lib/questos/types";

const prayers: Prayer[] = [
  {
    id: "prayer-active",
    title: "Family in Montréal",
    body: "Please bring peace to our home.",
    category: "family",
    status: "active",
    createdAt: "2026-07-19T16:00:00.000Z",
    updatedAt: "2026-07-19T16:00:00.000Z",
  },
  {
    id: "prayer-answered",
    body: "Help me through the interview.",
    category: "work",
    status: "answered",
    answeredAt: "2026-07-19T18:00:00.000Z",
    answerReflection: "A kind recruiter called with an offer.",
    createdAt: "2026-07-18T16:00:00.000Z",
    updatedAt: "2026-07-20T16:00:00.000Z",
  },
  {
    id: "prayer-archived",
    body: "An older prayer.",
    category: "general",
    status: "archived",
    createdAt: "2025-12-24T16:00:00.000Z",
    updatedAt: "2025-12-24T16:00:00.000Z",
  },
];

const reflections: Reflection[] = [
  {
    id: "reflection-scripture",
    prompt: "Which phrase stayed with you?",
    body: "Mercy felt close today.",
    mood: "hopeful",
    relatedQuestSlug: "quiet-mercy",
    relatedVerseReference: "Micah 6:8",
    createdAt: "2026-07-19T14:00:00.000Z",
    updatedAt: "2026-07-19T14:00:00.000Z",
  },
  {
    id: "reflection-archived",
    body: "A reflection set aside.",
    archivedAt: "2026-07-17T16:00:00.000Z",
    createdAt: "2026-07-17T15:00:00.000Z",
    updatedAt: "2026-07-17T16:00:00.000Z",
  },
];

describe("unified prayer journal timeline", () => {
  it("projects prayers and reflections into a discriminated mixed list", () => {
    const entries = toJournalEntries(prayers, reflections);
    const prayer = entries.find((entry) => entry.key === "prayer:prayer-active");
    const reflection = entries.find(
      (entry) => entry.key === "reflection:reflection-scripture",
    );

    expect(prayer).toMatchObject({
      kind: "prayer",
      title: "Family in Montréal",
      occurredAt: prayers[0].createdAt,
      entry: prayers[0],
    });
    expect(reflection).toMatchObject({
      kind: "reflection",
      title: "Reflection on Micah 6:8",
      occurredAt: reflections[0].createdAt,
      entry: reflections[0],
    });
  });

  it("derives stable counts independently of the active filter", () => {
    const timeline = deriveJournalTimeline(prayers, reflections, {
      filter: "answered",
    });

    expect(timeline.entries.map((entry) => entry.id)).toEqual([
      "prayer-answered",
    ]);
    expect(timeline.counts).toEqual({
      all: 3,
      prayers: 2,
      reflections: 1,
      active: 1,
      answered: 1,
      archived: 2,
    });
  });

  it("keeps archived prayers and reflections out of ordinary views", () => {
    const all = deriveJournalTimeline(prayers, reflections);
    const archived = deriveJournalTimeline(prayers, reflections, {
      filter: "archived",
    });

    expect(all.entries.map((entry) => entry.id)).toEqual([
      "prayer-active",
      "reflection-scripture",
      "prayer-answered",
    ]);
    expect(archived.entries.map((entry) => entry.id)).toEqual([
      "reflection-archived",
      "prayer-archived",
    ]);
    expect(archived.entries.every((entry) => entry.archivedAt)).toBe(true);
  });

  it("searches all relevant metadata with accent-insensitive AND tokens", () => {
    const entries = toJournalEntries(prayers, reflections);

    expect(
      filterJournalEntries(entries, { query: "family montreal" }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["prayer-active"]);
    expect(
      filterJournalEntries(entries, { query: "recruiter offer" }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["prayer-answered"]);
    expect(
      filterJournalEntries(entries, { query: "hopeful micah" }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["reflection-scripture"]);
    expect(filterJournalEntries(entries, { query: "mercy interview" })).toEqual(
      [],
    );
  });

  it("supports entry-date and last-updated ordering", () => {
    const entries = toJournalEntries(prayers, reflections);

    expect(
      filterJournalEntries(entries, { sort: "entry-date" })[0]?.id,
    ).toBe("prayer-active");
    expect(
      filterJournalEntries(entries, { sort: "last-updated" })[0]?.id,
    ).toBe("prayer-answered");
  });

  it("groups the sorted timeline into human-readable local dates", () => {
    const timeline = deriveJournalTimeline(prayers, reflections, {
      now: new Date("2026-07-19T20:00:00.000Z"),
      locale: "en-US",
    });

    expect(timeline.groups.map(({ key, label, entries }) => ({
      key,
      label,
      ids: entries.map((entry) => entry.id),
    }))).toEqual([
      {
        key: "2026-07-19",
        label: "Today",
        ids: ["prayer-active", "reflection-scripture"],
      },
      {
        key: "2026-07-18",
        label: "Yesterday",
        ids: ["prayer-answered"],
      },
    ]);

    const archived = deriveJournalTimeline(prayers, reflections, {
      filter: "archived",
      now: new Date("2026-07-19T20:00:00.000Z"),
      locale: "en-US",
    });
    expect(archived.groups.at(-1)?.label).toBe("December 24, 2025");
  });
});

describe("journal excerpts", () => {
  it("collapses whitespace and truncates without splitting Unicode characters", () => {
    expect(journalExcerpt("  A prayer\n\nwith   space  ")).toBe(
      "A prayer with space",
    );
    expect(journalExcerpt("🙏🏽 grace and peace", 4)).toBe("🙏🏽 g…");
    expect(journalExcerpt("anything", 1)).toBe("…");
    expect(journalExcerpt("anything", 0)).toBe("");
  });
});
