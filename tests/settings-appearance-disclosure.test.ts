import { readFileSync } from "node:fs";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Disclosure } from "@/components/design-system/Disclosure";

/**
 * Renders the real primitive to markup.
 *
 * `children` rides inside the props object rather than as a third argument:
 * `createElement`'s typing wants the component's whole prop type, `children`
 * is required on it, and this is a `.ts` file — vitest only collects
 * `tests/**\/*.test.ts`, so JSX is not available to sidestep it.
 */
function render(props: Omit<ComponentProps<typeof Disclosure>, "children">) {
  return renderToStaticMarkup(
    // eslint-disable-next-line react/no-children-prop -- see the note above
    createElement(Disclosure, { ...props, children: "x" }),
  );
}

/** The literal the effect matches on, written once. */
const APPEARANCE_HASH = '"#appearance"';

/**
 * Appearance is a collapsible card like every other settings group.
 *
 * It used to be the one always-visible section, on the argument that text size
 * and bold text are comfort settings nobody should hunt for. Collapsing it
 * costs those readers a tap, so the two things that made the old shape safe
 * have to survive the change: the Journey screen's "Customize" deep link still
 * has to land on an OPEN card, and the collapse still has to go still when
 * either reduce-motion switch is on.
 */
describe("Appearance settings disclosure", () => {
  const settings = readFileSync(
    "src/components/settings/SettingsScreen.tsx",
    "utf8",
  );
  const journey = readFileSync(
    "src/components/journey/JourneyScreen.tsx",
    "utf8",
  );
  const disclosure = readFileSync(
    "src/components/design-system/Disclosure.tsx",
    "utf8",
  );
  const wallpaper = readFileSync(
    "src/components/settings/WallpaperPicker.tsx",
    "utf8",
  );
  const css = readFileSync("src/app/globals.css", "utf8");

  /** The Appearance card only — so a Disclosure elsewhere can't satisfy these. */
  const appearanceBlock = (() => {
    const start = settings.indexOf('<section id="appearance"');
    expect(start, "the #appearance anchor still exists").toBeGreaterThan(-1);
    const end = settings.indexOf("</section>", start);
    expect(end).toBeGreaterThan(start);
    return settings.slice(start, end);
  })();

  it("renders Appearance through the shared Disclosure, inside the settings group", () => {
    // Tying the anchor to the primitive is the point: asserting only that the
    // file contains "<Disclosure" passes on the five cards that already did.
    expect(appearanceBlock).toMatch(
      /<section id="appearance"[^>]*>\s*<Disclosure/,
    );
    expect(appearanceBlock).toContain('variant="card"');

    // It joins the existing stack rather than floating above it with its own
    // heading, so the group's spacing governs all six cards.
    const group = settings.indexOf("<DisclosureGroup");
    const anchor = settings.indexOf('<section id="appearance"');
    const groupEnd = settings.indexOf("</DisclosureGroup>");
    expect(group).toBeGreaterThan(-1);
    expect(anchor).toBeGreaterThan(group);
    expect(anchor).toBeLessThan(groupEnd);

    // The old always-visible heading is gone; the trigger carries the label.
    expect(settings).not.toContain(
      "<SectionTitle>{t.settings.appearance}</SectionTitle>",
    );
    expect(appearanceBlock).toContain("label={t.settings.appearance}");
  });

  it("starts closed, and stays controlled so the hash can open it", () => {
    expect(settings).toContain(
      "const [appearanceOpen, setAppearanceOpen] = useState(false);",
    );
    expect(appearanceBlock).toContain("open={appearanceOpen}");
    expect(appearanceBlock).toContain("onOpenChange={setAppearanceOpen}");

    // defaultOpen would silently win back the old always-visible behaviour on
    // first paint and make the "starts closed" claim above vacuous.
    expect(appearanceBlock).not.toContain("defaultOpen");
  });

  it("opens itself for the Journey screen's deep link", () => {
    // The live consumer. If this link ever moves, the effect below is dead
    // code and this test should be the thing that says so.
    expect(journey).toContain('href="/app/settings#appearance"');

    expect(settings).toContain(APPEARANCE_HASH);
    expect(settings).toContain("setAppearanceOpen(true)");

    // Arriving from Journey is a fresh mount, but a back/forward step or a
    // second click while already on Settings only changes the hash — no
    // remount, no effect re-run. Without these listeners the card stays shut
    // and the reader is told nothing.
    //
    // Asserted on addEventListener, not the bare event name: the cleanup's
    // removeEventListener carries the same string, so a looser check stayed
    // green with the registration deleted.
    expect(settings).toContain(
      'window.addEventListener("hashchange", openFromHash);',
    );
    expect(settings).toContain(
      'window.addEventListener("popstate", openFromHash);',
    );

    // The browser scrolls to the anchor while the card is still shut and its
    // content measures zero height, so it lands short. Opening has to redo it.
    expect(settings).toContain("scrollIntoView");
  });

  it("keeps the wallpaper carousel clipped to the rounded card", () => {
    // The carousel bleeds past the card padding by design so artwork runs to
    // the edge. The old PaperCard clipped it; Disclosure's card variant does
    // not, so the clip has to be asked for or the corners square off.
    expect(wallpaper).toContain("-mx-4");
    expect(appearanceBlock).toContain("overflow-hidden");
  });

  it("hides closed content from assistive tech and the tab order", () => {
    // Rendered, not grepped: these are the properties a collapsed Appearance
    // stakes its accessibility on, and the closed markup is the only place
    // they are all true at once.
    const closed = render({ variant: "card", label: "Appearance" });
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('aria-hidden="true"');
    expect(closed).toContain("grid-rows-[0fr]");
    expect(closed).toContain("inert=");

    const open = render({
      variant: "card",
      label: "Appearance",
      defaultOpen: true,
    });
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain("grid-rows-[1fr]");
    // Not merely absent from the open markup — `inert` must be gone, and
    // under React 18 `inert={false}` serialised to the truthy string "false".
    expect(open).not.toContain("inert=");
  });

  it("leaves the collapse to CSS, so both reduce-motion switches flatten it", () => {
    // The grid 0fr->1fr technique is what makes stillness free here: it is a
    // plain CSS transition, so the two global kill-switches below reach it. A
    // JS height animation would sail straight past both.
    expect(disclosure).toContain("transition-[grid-template-rows]");

    // The OS media query, and the in-app Reduce Motion toggle. Both blanket
    // every element with transition: none, which is the only reason this
    // component needs no motion code of its own.
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\*,\s*\*::before,\s*\*::after \{[\s\S]*?transition: none !important;/,
    );
    expect(css).toMatch(
      /html\.force-reduce-motion \*,\s*html\.force-reduce-motion \*::before,\s*html\.force-reduce-motion \*::after \{[\s\S]*?transition: none !important;/,
    );

    // The scroll is ours, so stillness there is ours to honour too — the
    // stylesheet's scroll-behavior never reaches an explicit "smooth".
    expect(settings).toContain(
      'window.matchMedia("(prefers-reduced-motion: reduce)").matches',
    );
    expect(settings).toContain('classList.contains("force-reduce-motion")');
    expect(settings).toContain('behavior: still ? "auto" : "smooth"');
  });
});
