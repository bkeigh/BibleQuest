import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const button = readFileSync(
  "src/components/design-system/GentleButton.tsx",
  "utf8",
);

/**
 * Every rule block opening with a selector, joined.
 *
 * A selector appears more than once in this stylesheet — `body` sets colour in
 * one place and weight in another — so taking only the first block would test
 * whichever happened to come first in the file rather than the declaration
 * being looked for.
 */
function rulesFor(selector: string): string {
  const blocks: string[] = [];
  let at = css.indexOf(selector);
  while (at !== -1) {
    blocks.push(css.slice(at, css.indexOf("}", at)));
    at = css.indexOf(selector, at + selector.length);
  }
  return blocks.join("\n");
}

describe("wrapped-webview readiness", () => {
  it("does not flash a grey box over every tap", () => {
    // iOS paints its own highlight on any tapped element. The app already has
    // pressed and focus-visible states, so the default only ever duplicated —
    // badly — feedback it was giving more carefully.
    expect(rulesFor("html {")).toContain("-webkit-tap-highlight-color");
  });

  it("keeps the rubber band inside the document", () => {
    // Overscrolling past the end otherwise reveals whatever sits behind the
    // webview, which in a wrapped app is nothing at all.
    expect(css).toContain("overscroll-behavior-y: contain");
  });

  it("leaves Scripture and personal writing selectable", () => {
    // The whole point of the app. A long-press on a verse is how someone
    // copies it; on a prayer it is how they take their own words with them.
    // Selection comes off the chrome only, and these are listed back in
    // explicitly rather than left to inheritance.
    const readable = rulesFor(".verse-text,");
    expect(readable).toContain("user-select: text");
    // The selector list that re-enables it, read from the block that actually
    // carries the declaration rather than the first `.verse-text,` in the file.
    const block = readable.slice(
      readable.lastIndexOf(".verse-text,", readable.indexOf("user-select: text")),
    );
    for (const tag of ["blockquote", "input", "textarea", "[contenteditable]"]) {
      expect(block, `${tag} lost its selection`).toContain(tag);
    }
  });

  it("does not offer to save the artwork on a long press", () => {
    // Sprites and wallpapers are chrome. The callout stays on everywhere else,
    // which is what keeps the rule above true.
    expect(css).toContain("-webkit-touch-callout: none");
    const callout = css.indexOf("-webkit-touch-callout");
    const block = css.slice(Math.max(0, callout - 260), callout);
    expect(block).toContain(".pixelated");
  });

  it("holds the reading size a reader chose", () => {
    // Rotating a phone otherwise inflates body copy on its own.
    expect(rulesFor("body {")).toContain("text-size-adjust: 100%");
  });

  it("reaches under the notch and the home indicator", () => {
    expect(layout).toContain('viewportFit: "cover"');
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("env(safe-area-inset-top)");
  });

  it("gives every button size a thumb-sized target", () => {
    // The text variant drops padding on purpose — it is a link, not a slab.
    // It used to drop `min-h-11` along with it, which left a 23px target:
    // fine for a mouse, under half of Apple's 44pt minimum for a thumb.
    const textSizes = button.slice(button.indexOf("const TEXT_SIZES"));
    for (const size of ["sm:", "md:", "lg:"]) {
      const line = textSizes.slice(textSizes.indexOf(size));
      expect(line.slice(0, 60), `text variant ${size} lost its touch height`).toContain(
        "min-h-11",
      );
    }
  });
});
