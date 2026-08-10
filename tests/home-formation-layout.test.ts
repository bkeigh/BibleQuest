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

  it("gives the quest section one heading, above its card", () => {
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
    expect(home).not.toContain("A gentle next step");

    // The heading lives above the card, like every other section here. It used
    // to be duplicated *inside* the card — the same decorative h2 and the same
    // caption nested under a "For Today" heading — so this one row carried two
    // headings while Guided Scripture and the Arcade carried one.
    expect(home).toContain("<HomeSectionHeading");
    const card = home.slice(questLink, rhythm);
    expect(card, "the card is heading its own section again").not.toContain("<h2");
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

  it("uses the requested MyShepherd color inside one secondary-content disclosure", () => {
    // The blue moved from an inline style into `.app-glass-shepherd` so the
    // glass rule can tint it; an inline background would have out-ranked it.
    expect(home).toContain("app-glass-shepherd");
    expect(home).not.toContain('backgroundColor: "#3F7EA3"');
    expect(home).toContain("space-y-7 pb-7");
    // First-time Home now leads with Scripture and one quest. Optional guides,
    // games, promotions, and support remain reachable behind one real control.
    expect(home).toContain("<Disclosure");
    expect(home).toContain("Explore more");
    expect(home).toContain(
      'nativeTarget\n                    ? "Your rhythm, guided Scripture, growth, and games"',
    );
    expect(home).toContain('variant="quiet"');
    expect(home).not.toContain("function QuickActionTile");
  });

  it("does not consume the account prompt while Explore more is closed", () => {
    const prompt = readFileSync(
      "src/components/account/AccountPrompt.tsx",
      "utf8",
    );

    expect(prompt).toContain("new IntersectionObserver");
    expect(prompt).toContain("if (!entry?.isIntersecting) return;");
    expect(prompt).toContain("observer.observe(prompt)");
    expect(prompt).toContain("<div ref={promptRef}>");
  });

  it("uses editorial artwork and display type for games", () => {
    expect(card).toContain("/art/scripture-games-today.webp");
    expect(card).toContain("/art/seven-days-match-poster.webp");
    expect(card).toContain("/art/scripture-games-coming-2.webp");
    // Card titles use the display face everywhere, including the guide card.
    expect(card).toContain('font-display text-[1.75rem]');
    expect(card).not.toContain("font-art-label text-[2rem]");
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

  it("removes destinations already represented by the primary navigation", () => {
    const support = home.indexOf("<SupportLink");
    const newsletter = home.indexOf("<NewsletterLink");

    expect(support).toBeGreaterThan(-1);
    expect(newsletter).toBeGreaterThan(support);
    // Prayer and Bible stay one tap away in BottomNav instead of appearing a
    // second time as a three-card choice near the end of an already long Home.
    expect(home).not.toContain('title="One minute of prayer"');
    expect(home).not.toContain('title="Open the Bible"');
    expect(home).not.toContain('title="Reflect on Today"');
  });
});
