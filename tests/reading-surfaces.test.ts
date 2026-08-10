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

    it("does not paint a control's focus ring around the whole panel", () => {
      // The sheet takes focus on open so a screen reader lands inside it, and
      // Safari counts that as focus-visible. The global rule then drew a 2px
      // accent outline — square-cornered, since it forces a 4px radius —
      // around the entire sheet. A dialog is not a control.
      expect(css).toContain(':focus-visible:not([id^="verse-"]):not([role="dialog"])');
      // An `outline-none` utility cannot fix this: the rule is unlayered and
      // utilities are layered, so the rule wins regardless of specificity. The
      // panel therefore must not try — but the launcher *button* is a control
      // and legitimately trades `outline` for a box-shadow ring, so this looks
      // at the panel's own class list rather than banning the utility outright.
      const panelStart = floating.indexOf('id="floating-my-shepherd"');
      expect(panelStart, "could not find the sheet panel").toBeGreaterThan(-1);
      const panel = floating.slice(panelStart, floating.indexOf(">", panelStart));
      expect(panel).not.toContain("outline-none");
    });

    it("rings the launcher with a shadow so it cannot render as a square", () => {
      // `outline` with an offset is drawn as a rectangle by some engines no
      // matter the border-radius, which turned the round launcher into a
      // square with a green box around it whenever it held focus — most
      // visibly right after the sheet closed and handed focus back.
      //
      // The launcher is the LAST `<button` in the file; the panel above it
      // carries the same aria-label, so searching by label finds the dialog.
      const launcherStart = floating.lastIndexOf("<button");
      expect(launcherStart, "could not find the launcher").toBeGreaterThan(-1);
      const launcher = floating.slice(launcherStart);
      expect(launcher).toContain(': "Ask MyShepherd"');
      expect(launcher).toContain("rounded-full");
      expect(launcher).toContain("focus-visible:shadow-");
      expect(launcher).not.toContain("focus-visible:outline-2");
    });

    it("is the illustrated character itself, not a button holding one", () => {
      // The sprite is drawn with its own transparency and its own edges. A
      // filled disc with a border around it turned the character into a small
      // mark inside a control; separation comes from a drop shadow instead.
      const launcher = floating.slice(floating.lastIndexOf("<button"));
      const launcherTag = launcher.slice(0, launcher.indexOf(">"));
      expect(launcher).toContain("drop-shadow");
      expect(launcherTag).not.toContain("border border-");
      expect(launcherTag).not.toMatch(/\bbg-(marian|paper|white|accent)/);
      expect(launcherTag).not.toContain("SHEPHERD_INK");
    });

    it("moves, docks, and peeks on mobile without shrinking its touch target away", () => {
      const launcher = floating.slice(floating.lastIndexOf("<button"));
      expect(floating).toContain("useMobileOrTabletViewport");
      expect(floating).toContain("dockFloatingLauncher");
      expect(floating).toContain("LAUNCHER_PEEK = 24");
      expect(floating).toContain("LAUNCHER_ART_SIZE = 97");
      expect(launcher).toContain("onPointerDown={startLauncherDrag}");
      expect(launcher).toContain('"Show MyShepherd button"');
      expect(launcher).toContain("my-shepherd-launcher-pulse");
    });

    it("is a card on every edge rather than a half-docked sheet", () => {
      // Full-bleed sides belong to a sheet anchored to the bottom of the
      // screen. This one stops above the tab bar, so the square side edges
      // read as crowded rather than deliberate.
      expect(floating).toContain('"px-4 sm:px-0"');
      expect(floating).toContain('"rounded-[22px]"');
      expect(floating).not.toContain("rounded-t-[22px]");
    });

    it("carries white on a blue that can actually hold it", () => {
      // White on marian-500 is 4.45:1 — under the floor for text this size, so
      // the header subtitle failed at any opacity. marian-700 carries it at 9.4:1.
      expect(floating).toContain('const SHEPHERD_INK = "bg-marian-700"');
      expect(floating).not.toContain("#3F7EA3");
    });

    it("shows send as waiting rather than as failed", () => {
      // A filled circle at 45% opacity reads as a broken control.
      expect(floating).toContain("const canSend =");
      expect(floating).not.toContain("disabled:opacity-45");
    });

    it("keeps starters from looking like the replies they sit above", () => {
      // As rounded-full chips they shared a shape and fill with the answer
      // bubbles that arrive seconds later.
      const starters = floating.slice(floating.indexOf("STARTERS.map"));
      expect(starters.slice(0, 700)).not.toContain("rounded-full");
      expect(starters.slice(0, 700)).toContain("IconArrowRight");
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

  describe("quest shelves", () => {
    const shelf = readFileSync(
      "src/components/quests/QuestShelf.tsx",
      "utf8",
    );
    const browse = readFileSync(
      "src/components/quests/QuestBrowse.tsx",
      "utf8",
    );
    const boardCard = readFileSync(
      "src/components/quests/QuestBoardCard.tsx",
      "utf8",
    );

    it("shows the collection as one paged list, not a shelf per category", () => {
      // A shelf per category was meant to make the range of quests visible,
      // and as rails it did. As columns it did the opposite: seventeen
      // categories at twenty-four cards each rendered four hundred cards and a
      // page fifty-six thousand pixels tall. The Filters disclosure already
      // answers "what kinds are there" in a single screen.
      expect(browse).not.toContain("groupedResults");
      expect(browse).toContain("results.slice(0, visibleCount)");
      expect(browse).toContain("Show 24 more");
    });

    it("keeps the catalogue a column and gives the switch to the board", () => {
      // The switch governs Active / Ready / Completed — the reader's own
      // quests, which are tall cards worth railing. Pointed at the catalogue
      // it wrapped one card in three cards' worth of chrome.
      expect(browse).toContain('<QuestLane as="ul" layout={layout}');
      expect(browse).toContain('<QuestLayoutToggle layout={layout}');
      for (const shelfCall of browse.matchAll(/<QuestShelf[\s\S]{0,220}?>/g)) {
        expect(shelfCall[0], "a catalogue shelf is still taking the switch").not.toContain(
          "layout={layout}",
        );
      }
    });

    it("opens on rows and remembers the reader's choice", () => {
      expect(browse).toContain("readQuestLayout()");
      expect(shelf).toContain('=== "list" ? "list" : "rail"');
      expect(shelf).toContain("writeQuestLayout");
    });

    it("keeps both layouts a real choice", () => {
      // A rail is worse for comparing options or for a braille display, so the
      // column has to render the same cards rather than a reduced set.
      expect(shelf).toContain('if (layout === "list")');
      expect(shelf).toContain("{children}");
    });

    it("rails a real list rather than orphaning the cards", () => {
      // The board's groups are `<ul>`s of `<li>` cards. A lane that always
      // rendered a `<div>` would leave every card an `<li>` with no list
      // parent, which is exactly the structure a screen reader reads as "no
      // list here" while announcing list items.
      expect(shelf).toContain('as: Tag = "div"');
      expect(shelf).toContain("<Tag");
    });

    it("lets a rail slot size its card", () => {
      // `h-full` on the slot resolves against an auto-height rail and cancels
      // the stretch it was meant to help; a one-cell grid does the job.
      expect(shelf).toContain("grid w-[82%]");
      expect(shelf).toContain("[&>*]:h-full");
      expect(shelf).toContain("items-stretch");
    });

    it("clears an expired quest without opening Details", () => {
      // Remove used to live inside the collapsed panel, so clearing a quest
      // meant opening a card you had already decided about.
      const actionRow = boardCard.slice(
        boardCard.indexOf("{primaryAction}"),
        boardCard.indexOf("aria-expanded={open}"),
      );
      expect(actionRow).toContain("removeQuest(quest.slug)");
    });
  });
});
