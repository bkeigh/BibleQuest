import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { connectionPuzzles } from "@/data/games";
import { getGameAccess } from "@/lib/games/access";
import { gameShareText } from "@/lib/games/links";

describe("Scripture game product boundaries", () => {
  it("keeps today's full study free and Plus breadth optional", () => {
    expect(getGameAccess("today", false).allowed).toBe(true);
    expect(getGameAccess("archive", false)).toMatchObject({
      allowed: false,
      reason: "plus-optional",
    });
    expect(getGameAccess("theme-pack", true).allowed).toBe(true);
    expect(getGameAccess("archive", false).message).toContain("includes");
  });

  it("shares no answers, attempts, score, identity, or spiritual records", () => {
    const puzzle = connectionPuzzles[0];
    const text = gameShareText(puzzle);
    for (const group of puzzle.groups) {
      expect(text).not.toContain(group.title);
      for (const term of group.terms) expect(text).not.toContain(term);
    }
    expect(text.toLocaleLowerCase()).not.toMatch(
      /score|attempt|miss|streak|rank|prayer|reflection/,
    );
  });

  it("has no QuestOS or growth write boundary", () => {
    // Recursive: the boundary has to hold for game modules added in
    // subdirectories too, not only the ones that happen to sit at the top.
    const collect = (root: string): string[] =>
      readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? collect(join(root, entry.name))
          : /\.(ts|tsx)$/.test(entry.name)
            ? [join(root, entry.name)]
            : [],
      );
    const files = ["src/lib/games", "src/components/games"].flatMap(collect);
    expect(files.length).toBeGreaterThan(10);
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toContain("@/lib/questos/store");
  });

  it("emits only bounded game-kind lifecycle analytics", () => {
    const source = [
      "ConnectionsGame.tsx",
      "TimelineGame.tsx",
      "GamesScreen.tsx",
      "ArchiveGameScreen.tsx",
    ]
      .map((file) =>
        readFileSync(join("src/components/games", file), "utf8"),
      )
      .join("\n");
    expect(source).toContain('"scripture_game_started"');
    expect(source).toContain('"scripture_game_completed"');
    const boundedCalls =
      source.match(
        /track\(\s*"scripture_game_(?:started|completed)"\s*,\s*\{\s*kind:\s*(?:"connections"|"timeline"|puzzle\.kind)\s*,?\s*\}\s*\)/g,
      ) ?? [];
    expect(boundedCalls).toHaveLength((source.match(/\btrack\(/g) ?? []).length);
  });

  it("routes result sharing through the central platform boundary", () => {
    const source = readFileSync(
      "src/components/games/GameLearningCard.tsx",
      "utf8",
    );
    expect(source).toContain('from "@/lib/platform/api"');
    expect(source).toContain('from "@/lib/platform/share"');
    expect(source).not.toContain("window.location.origin");
    expect(source).not.toContain("navigator.share");
    expect(source).toContain("spoiler-free result link");
    expect(source).not.toContain("private result link");
  });

  it("moves focus to revealed results and hard-gates disabled archive play", () => {
    for (const file of ["ConnectionsGame.tsx", "TimelineGame.tsx"]) {
      const source = readFileSync(join("src/components/games", file), "utf8");
      expect(source).toContain("resultHeadingRef.current?.focus()");
      expect(source).toContain("tabIndex={-1}");
      expect(source).toContain("commitProgress");
      expect(source).toContain("this browser cannot save your place");
    }
    const route = readFileSync(
      "src/app/app/games/archive/[puzzle]/page.tsx",
      "utf8",
    );
    expect(route).toContain("!GREEN_FEATURES.games");
    expect(route).toContain("notFound()");
  });

  it("labels daily and archive game surfaces honestly", () => {
    const source = readFileSync("src/components/games/GameShell.tsx", "utf8");
    expect(source).toContain('"Today’s game"');
    expect(source).not.toContain("Today’s game · Free");
    expect(source).toContain("Archive study · Plus");
    expect(
      readFileSync("src/components/games/ArchiveGameScreen.tsx", "utf8"),
    ).toContain('context="archive"');
  });
});
