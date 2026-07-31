import { describe, expect, it } from "vitest";
import { gamePuzzles } from "@/data/games";
import { questBySlug } from "@/data/seed/quests";
import { scriptureSourceHref } from "@/lib/games/links";
import { validateGameCatalog } from "@/lib/games/validation";
import type { ConnectionsPuzzle } from "@/lib/games/types";

describe("reviewed Scripture game content", () => {
  it("ships only a valid, sourced, reviewed catalog", () => {
    expect(
      validateGameCatalog(gamePuzzles, new Set(questBySlug.keys())),
    ).toEqual([]);
    expect(gamePuzzles.filter((puzzle) => puzzle.kind === "connections").length)
      .toBeGreaterThanOrEqual(3);
    expect(gamePuzzles.filter((puzzle) => puzzle.kind === "timeline").length)
      .toBeGreaterThanOrEqual(3);
  });

  it("keeps every related handoff inside the reviewed free quest catalog", () => {
    for (const puzzle of gamePuzzles) {
      const slug = puzzle.learning.relatedQuestSlug;
      if (!slug) continue;
      const quest = questBySlug.get(slug);
      expect(quest, `${puzzle.id} quest handoff`).toBeDefined();
      expect(quest?.isPremium, `${puzzle.id} keeps its quest handoff free`).toBe(
        false,
      );
      expect(puzzle.learning.relatedQuestLabel).toBeTruthy();
    }
  });

  it("builds exact chapter-reader links for cited ranges", () => {
    expect(
      scriptureSourceHref({
        reference: "Mark 4:3–20",
        bookSlug: "mark",
        chapter: 4,
        verseStart: 3,
        verseEnd: 20,
      }),
    ).toBe("/app/bible/mark/4?verse=3-20#verse-3");
  });

  it("rejects duplicate terms that could create an ambiguous grouping", () => {
    const source = gamePuzzles.find(
      (puzzle): puzzle is ConnectionsPuzzle =>
        puzzle.kind === "connections",
    );
    expect(source).toBeDefined();
    if (!source) return;
    const malformed = {
      ...source,
      id: "malformed-duplicate-term",
      groups: [
        source.groups[0],
        {
          ...source.groups[1],
          terms: [
            source.groups[0].terms[0],
            ...source.groups[1].terms.slice(1),
          ],
        },
        source.groups[2],
      ],
    } as unknown as ConnectionsPuzzle;

    const errors = validateGameCatalog(
      [malformed, gamePuzzles.find((puzzle) => puzzle.kind === "timeline")!],
      new Set(questBySlug.keys()),
    );
    expect(errors.some((error) => error.includes("ambiguous duplicate term"))).toBe(
      true,
    );
  });

  it("rejects a citation label that drifts from its structured passage link", () => {
    const source = gamePuzzles.find(
      (puzzle): puzzle is ConnectionsPuzzle =>
        puzzle.kind === "connections",
    );
    expect(source).toBeDefined();
    if (!source) return;
    const malformed = {
      ...source,
      id: "malformed-citation-label",
      learning: {
        ...source.learning,
        readSource: {
          ...source.learning.readSource,
          reference: "Mark 4:4",
        },
      },
    } satisfies ConnectionsPuzzle;
    const timeline = gamePuzzles.find((puzzle) => puzzle.kind === "timeline")!;
    const errors = validateGameCatalog(
      [malformed, timeline],
      new Set(questBySlug.keys()),
    );
    expect(
      errors.some((error) => error.includes("does not match")),
    ).toBe(true);
  });
});
