import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Home formation layout", () => {
  const home = readFileSync("src/components/home/HomeScreen.tsx", "utf8");
  const formation = readFileSync(
    "src/components/home/TodayFormation.tsx",
    "utf8",
  );

  it("places the quest component directly under For Today", () => {
    const forToday = home.indexOf('id="for-today-home-title"');
    const questLink = home.indexOf('href="/app/quests"', forToday);
    const formationSections = home.indexOf("<TodayFormation", forToday);

    expect(forToday).toBeGreaterThan(-1);
    expect(questLink).toBeGreaterThan(forToday);
    expect(formationSections).toBeGreaterThan(questLink);
  });

  it("gives Guided Scripture and Scripture Games dedicated sections", () => {
    expect(formation).toContain(
      'aria-labelledby="guided-scripture-home-title"',
    );
    expect(formation).toContain(
      'aria-labelledby="scripture-games-home-title"',
    );
    expect(formation).toContain("Guided Scripture");
    expect(formation).toContain("Scripture Games");
  });
});
