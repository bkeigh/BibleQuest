import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Home formation layout", () => {
  const home = readFileSync("src/components/home/HomeScreen.tsx", "utf8");
  const formation = readFileSync(
    "src/components/home/TodayFormation.tsx",
    "utf8",
  );
  const bible = readFileSync("src/components/bible/BibleIndex.tsx", "utf8");
  // The card itself now lives beside the arcade, so Home and the arcade page
  // draw the same one instead of two that drift apart.
  const card = readFileSync(
    "src/components/games/ArcadeGameCard.tsx",
    "utf8",
  );

  it("keeps the arcade off the Bible tab", () => {
    // The Bible tab is a reading surface: it may offer the guided reading, but
    // games belong on Home and their own tab. Omitting `show` here would
    // default to "all" and pull the games rail back in.
    expect(bible).toContain('<TodayFormation dayKey={dayKey} show="guide" />');
    expect(bible).not.toContain("<TodayFormation dayKey={dayKey} />");
  });

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
    expect(formation).toContain('aria-labelledby="arcade-home-title"');
    expect(formation).toContain("Guided Scripture");
    expect(formation).toContain("BibleQuest Arcade");
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
    expect(card).toContain("/art/scripture-games-today.webp");
    expect(card).toContain("/art/scripture-games-coming-1.webp");
    expect(card).toContain("/art/scripture-games-coming-2.webp");
    // Pixel is the app's label face (0.875rem badges and section headings).
    // Card titles use the display face everywhere, including the guide card in
    // this same file — a 2rem pixel title was the lone exception and competed
    // with the pixel section heading directly above it.
    expect(card).toContain('font-display text-[1.75rem]');
    expect(card).not.toContain("font-pixel text-[2rem]");
    expect(formation).toContain("snap-mandatory");
    expect(formation.match(/role=\"listitem\"/g)).toHaveLength(3);
    expect(card).toContain("flex h-full min-h-[17rem] w-full flex-col");
    expect(card).toContain("mt-auto pt-8");
    expect(formation).toContain("absolute -left-5");
    expect(formation).toContain("absolute -right-5");
    expect(formation).toContain("sm:-left-8");
    expect(formation).toContain("sm:-right-8");
    expect(formation).toContain("const edgeTolerance = 24");
    expect(formation).toContain("Seven Days Match");
    // Seven Days Match stopped being a preview and became a real card, so the
    // rail leads with a game the reader can open rather than one they cannot.
    expect(formation).toContain("7 days · 7 levels each");
    expect(formation).toContain('href="/app/games/seven-days"');
    expect(formation.indexOf("Seven Days Match")).toBeLessThan(
      formation.indexOf("Today’s game"),
    );
  });

  it("sizes every arcade card identically", () => {
    // Each rail item must share one width class and stretch to a common
    // height; per-card widths previously made the cards visibly mismatched.
    const items = formation.match(/role="listitem" className=\{([^}]+)\}/g);
    expect(items).toHaveLength(3);
    expect(new Set(items)).toHaveLength(1);
    expect(formation).toContain(
      'const GAME_RAIL_ITEM = "w-[86%] shrink-0 snap-start sm:w-[70%]"',
    );
    expect(formation).toContain("group block h-full rounded-");
    expect(card).toContain("flex h-full min-h-[17rem] overflow-hidden");
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
