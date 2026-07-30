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
    const shepherd = home.indexOf("<ShepherdCallout", guided);
    const growth = home.indexOf('href="/app/journey"', shepherd);
    const games = home.indexOf('show="game"', growth);

    expect(forToday).toBeGreaterThan(-1);
    expect(questLink).toBeGreaterThan(forToday);
    expect(rhythm).toBeGreaterThan(questLink);
    expect(guided).toBeGreaterThan(rhythm);
    expect(shepherd).toBeGreaterThan(guided);
    expect(growth).toBeGreaterThan(shepherd);
    expect(games).toBeGreaterThan(growth);
    expect(home).toContain('subtitle="Your next step"');
    expect(home).not.toContain("A gentle next step");
  });

  it("aligns dedicated formation headings through one shared component", () => {
    expect(formation).toContain(
      'aria-labelledby="guided-scripture-home-title"',
    );
    expect(formation).toContain(
      'aria-labelledby="scripture-games-home-title"',
    );
    expect(formation).toContain("Guided Scripture");
    expect(formation).toContain("Scripture Games");
    expect(formation).toContain("<HomeSectionHeading");
    expect(formation).toContain(
      '{afterGuide && <div className="mt-4">{afterGuide}</div>}',
    );
    expect(home).toContain("<HomeSectionHeading");
  });

  it("uses the requested MyShepherd color and matched quick actions", () => {
    expect(home).toContain('backgroundColor: "#3F7EA3"');
    expect(home).toContain("space-y-7 pb-7");
    expect(home).toContain("grid grid-cols-3");
    expect(home).toContain("min-h-[7.5rem]");
  });

  it("uses Instagram artwork and prominent Ithaca type for games", () => {
    expect(formation).toContain("/art/scripture-games-today.webp");
    expect(formation).toContain("/art/scripture-games-coming-1.webp");
    expect(formation).toContain("/art/scripture-games-coming-2.webp");
    expect(formation).toContain("font-pixel text-[2rem]");
    expect(formation).toContain("snap-mandatory");
    expect(formation.match(/role=\"listitem\"/g)).toHaveLength(3);
    expect(formation).toContain("Seven Days Match");
    expect(formation).toContain("7 chapters · 7 levels each");
    expect(formation).toContain("Genesis 1:1");
  });

  it("places the three shortcuts between support and newsletter", () => {
    const support = home.indexOf("<SupportLink");
    const prayer = home.indexOf('title="One minute of prayer"', support);
    const bible = home.indexOf('title="Open the Bible"', prayer);
    const reflections = home.indexOf('title="Reflect on Today"', bible);
    const newsletter = home.indexOf("<NewsletterLink");

    expect(support).toBeGreaterThan(-1);
    expect(prayer).toBeGreaterThan(support);
    expect(bible).toBeGreaterThan(prayer);
    expect(reflections).toBeGreaterThan(bible);
    expect(newsletter).toBeGreaterThan(reflections);
  });
});
