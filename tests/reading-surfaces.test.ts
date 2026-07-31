import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards the July 2026 reading-surface pass: the MyShepherd sheet, Scripture
 * highlights, and composer prompts. Each assertion pins a defect that reached
 * a device, so the comment says what the reader saw rather than what the code
 * does.
 */
describe("reading surfaces", () => {
  const floating = readFileSync(
    "src/components/shepherd/FloatingMyShepherd.tsx",
    "utf8",
  );
  const viewport = readFileSync("src/lib/platform/keyboard-inset.ts", "utf8");
  const reader = readFileSync("src/components/bible/ChapterReader.tsx", "utf8");
  const css = readFileSync("src/app/globals.css", "utf8");
  const prayer = readFileSync(
    "src/components/prayer/PrayerComposer.tsx",
    "utf8",
  );
  const reflection = readFileSync(
    "src/components/reflection/ReflectionComposer.tsx",
    "utf8",
  );

  describe("MyShepherd sheet", () => {
    it("lays the sheet out inside the visible viewport", () => {
      // The sheet used to be pinned with `bottom: <keyboard inset>px` and
      // capped with `min(72dvh, 100dvh - inset - 5rem, …)`. One stale guess
      // left a band of page showing between the sheet and the keyboard, and
      // the cap crushed the conversation until starters were sliced in half.
      expect(floating).toContain("useVisualViewport");
      expect(floating).toContain("top: viewport.offsetTop");
      expect(floating).toContain("height: viewport.height");
      expect(floating).not.toContain("72dvh");
    });

    it("does not raise the keyboard before the sheet has been seen", () => {
      // Autofocus on a phone opened the keyboard over the sheet the instant
      // it appeared, hiding the starters and the privacy note.
      expect(floating).toContain("if (compact) sheetRef.current?.focus()");
      expect(floating).toContain("else inputRef.current?.focus()");
    });

    it("only claims modality where the scrim actually blocks the page", () => {
      // aria-modal promises focus cannot wander. The desktop panel leaves the
      // page usable on purpose, so the promise is phone-only — and where it
      // is made, a focus trap and a scroll lock have to keep it.
      expect(floating).toContain("aria-modal={compact}");
      expect(floating).toContain("if (!open || !compact) return");
      expect(floating).toContain('style.overflow = "hidden"');
    });

    it("sends with the arrow every messaging surface has taught", () => {
      // Send used to carry the same sparkle as the launcher and the reply
      // avatar, so the one control that commits a question looked decorative.
      expect(floating).not.toContain("<IconSparkle size={18} />");
      expect(floating.indexOf("IconArrowUp size")).toBeGreaterThan(
        floating.indexOf('type="submit"'),
      );
    });

    it("keeps an unanswered question rather than dropping it", () => {
      // On failure the words were gone: the field had been cleared and no
      // turn was recorded, so a long question had to be retyped.
      expect(floating).toContain("setQuestion(trimmed)");
    });

    it("reports the visible region, not just the covered height", () => {
      expect(viewport).toContain("export function useVisualViewport");
      expect(viewport).toContain("keyboardInset");
      expect(viewport).toContain("offsetTop");
    });
  });

  describe("Scripture highlights", () => {
    it("marks verses with tokens strong enough to see on a wallpaper", () => {
      // Highlights were 10–20% gold over the reader's chosen scene, which on
      // a busy or dark wallpaper showed nothing at all — a shared verse link
      // landed with no visible target.
      expect(reader).toContain("verse-mark-targeted");
      expect(reader).toContain("verse-mark-selected");
      expect(reader).toContain("verse-mark-saved");
      expect(reader).not.toContain("bg-gold-500/15");
      expect(reader).not.toContain("bg-gold-500/20");
    });

    it("keeps the three verse states visibly ranked in both themes", () => {
      for (const state of ["saved", "targeted", "selected"]) {
        expect(css).toContain(`.verse-mark.verse-mark-${state}`);
        expect(css).toContain(
          `html.theme-dark .verse-mark.verse-mark-${state}`,
        );
      }
    });

    it("lets a state mark outrank the keyboard-focus trace", () => {
      // The focus rule carries a pseudo-class, so the state rules need two
      // classes to win — otherwise arrowing onto a saved verse erases its mark.
      const focusRule = css.indexOf("button:focus-visible > :where(.verse-mark)");
      expect(focusRule).toBeGreaterThan(-1);
      expect(css).toContain(".verse-mark.verse-mark-saved");
    });
  });

  describe("composer prompts", () => {
    it("gives placeholders a colour meant to be read", () => {
      // Prompts sat at --color-fog: 2.3:1 on paper, so a prayer prompt washed
      // into the card it was printed on.
      expect(css).toContain("--color-quill:");
      expect(css).toContain("::placeholder");
      expect(prayer).not.toContain("placeholder:text-fog");
      expect(reflection).not.toContain("placeholder:text-fog");
      expect(prayer).toContain("placeholder:text-quill");
    });

    it("keeps a candlelight value for the prompt colour", () => {
      const darkBlock = css.slice(css.indexOf("html.theme-dark {"));
      expect(darkBlock.slice(0, 1200)).toContain("--color-quill:");
    });
  });
});
