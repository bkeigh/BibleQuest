import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards the interface decisions from the July 2026 UX pass. Each assertion
 * pins a defect that shipped once, so the comment says what went wrong rather
 * than restating the code.
 */
describe("UX pass guardrails", () => {
  const shepherd = readFileSync(
    "src/components/shepherd/MyShepherd.tsx",
    "utf8",
  );
  const generator = readFileSync(
    "src/components/quests/QuestGenerator.tsx",
    "utf8",
  );
  const slip = readFileSync("src/components/quests/QuestSlip.tsx", "utf8");
  const formation = readFileSync(
    "src/components/home/TodayFormation.tsx",
    "utf8",
  );
  const infoHint = readFileSync(
    "src/components/design-system/InfoHint.tsx",
    "utf8",
  );
  const supportLink = readFileSync(
    "src/components/plus/SupportLink.tsx",
    "utf8",
  );

  it("never promises the reader something about credits", () => {
    // BibleQuest has no credit or quota concept; the old failure copy
    // reassured readers about a system that does not exist. Matching the
    // sentence rather than the bare word keeps the explanatory comment legal.
    expect(shepherd).not.toContain("No credits were used");
  });

  it("offers MyShepherd starters beside the field they fill", () => {
    // Starters used to sit in a separate card below the input and below the
    // error, so the most useful affordance for a first question was off screen.
    const textarea = shepherd.indexOf("my-shepherd-question");
    const starters = shepherd.indexOf("Or start with one of these");
    // Anchor on the button's own label expression: the bare string also
    // appears earlier as the Plus dialog title.
    const askButton = shepherd.indexOf("Thinking gently…");
    expect(starters).toBeGreaterThan(textarea);
    expect(starters).toBeLessThan(askButton);
  });

  it("keeps a successful on-device quest match out of the error channel", () => {
    // The reviewed local matcher succeeding is not a failure, and its result
    // already carries a `notice` explaining provenance.
    expect(generator).not.toContain("Haiku is resting");
    expect(generator).toContain(
      "setError(\"BibleQuest couldn’t choose a quest just now",
    );
  });

  it("keeps the quest slip action out of the content column entirely", () => {
    // This used to reserve a 72px right-hand gutter for an absolutely
    // positioned action, which left the text column at 141px of a 335px card.
    // The action is now an inline sibling below the body, so there is nothing
    // overlapping to reserve space for — and nothing to re-introduce.
    expect(slip).not.toContain("pr-[4.5rem]");
    expect(slip).not.toContain("absolute right-4 top-4");
    // The card stays one tap target via an overlay link, which is what lets
    // real buttons sit inside the card without nesting inside an anchor.
    expect(slip).toContain("after:absolute after:inset-0");
    // A small category mark in a fixed slot, not an illustration the text has
    // to flow around: 80px art was the other half of the squeeze, and even at
    // 40px it still indented every line under it.
    expect(slip).toContain("h-6 w-6 shrink-0");
    expect(slip).toContain("size={22}");
    expect(slip).not.toContain("size={80}");
  });

  it("gives the quest slip title and body the full card width", () => {
    // The header rail carries the mark, the metadata and the actions; the
    // title and invitation are its siblings, not nested in a column beside
    // the artwork, so neither is indented by it.
    const headerRail = slip.slice(
      slip.indexOf("One header rail"),
      slip.indexOf("{heading}"),
    );
    expect(headerRail).toContain("justify-between");
    expect(headerRail).toContain("shrink-0 items-center gap-1");
    // The title follows the rail rather than living inside it.
    expect(slip).toMatch(/\{action &&[\s\S]{0,220}?\}\s*<\/div>\s*\{heading\}/);
  });

  it("gives the Home games rail a real link to the games surface", () => {
    // Games have no nav tab by design, so the rail is the only entry point.
    // The previous affordance was a non-interactive hint hidden below sm.
    expect(formation).toContain('href="/app/games"');
    expect(formation).toContain("All games");
    expect(formation).not.toContain("Scroll to explore");
  });

  it("keeps voluntary support quieter than the primary Scripture action", () => {
    // Two full evergreen banners on Home make a donation equal to Scripture.
    // Support remains visible as a gold-edged paper surface instead.
    expect(supportLink).toContain('data-paper-variant="quiet"');
    expect(supportLink).toContain("app-glass-surface");
    expect(supportLink).not.toContain("bg-evergreen-700");
  });

  it("wires InfoHint for assistive tech rather than styling alone", () => {
    expect(infoHint).toContain("aria-expanded");
    expect(infoHint).toContain("aria-controls");
    expect(infoHint).toContain("aria-labelledby");
    expect(infoHint).toContain("inert={!open}");
  });
});
