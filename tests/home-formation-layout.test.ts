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
    const rhythm = home.indexOf("<RhythmTodayCard", questLink);
    const guided = home.indexOf('show="guide"', rhythm);
    const growth = home.indexOf('href="/app/journey"', guided);
    const games = home.indexOf('show="game"', growth);

    expect(forToday).toBeGreaterThan(-1);
    expect(questLink).toBeGreaterThan(forToday);
    expect(rhythm).toBeGreaterThan(questLink);
    expect(guided).toBeGreaterThan(rhythm);
    expect(growth).toBeGreaterThan(guided);
    expect(games).toBeGreaterThan(growth);
    expect(home).toContain("Your Next Step");
    expect(home).not.toContain("A gentle next step");
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
    expect(formation).toContain("whitespace-nowrap");
    expect(formation).toContain("sm:justify-between");
  });

  it("uses the requested MyShepherd color and roomier Home actions", () => {
    expect(home).toContain('tone="shepherd"');
    expect(home).toContain('backgroundColor: "#3F7EA3"');
    expect(home).toContain("space-y-5 pb-5");
    expect(home).toContain("flex min-h-20 items-center gap-4");
  });

  it("places newsletter updates beneath one-time support", () => {
    const support = home.indexOf("<SupportLink");
    const newsletter = home.indexOf("<NewsletterLink");

    expect(support).toBeGreaterThan(-1);
    expect(newsletter).toBeGreaterThan(support);
  });
});
