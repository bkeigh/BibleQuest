import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeQuestCategory } from "@/components/home/HomeQuestCategory";

/** Renders an empty category so disclosure semantics stay easy to inspect. */
function renderCategory(defaultOpen: boolean) {
  return renderToStaticMarkup(
    createElement(HomeQuestCategory, {
      label: "Active",
      items: [],
      defaultOpen,
      emptyBody: "No quest is underway right now.",
    }),
  );
}

describe("HomeQuestCategory", () => {
  it("keeps the category header visible above an inert closed region", () => {
    const html = renderCategory(false);

    expect(html).toContain("<h3>");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("inert");
    expect(html).toContain(">Active<");
    expect(html).toContain(">0<");
  });

  it("opens a labelled region without leaving it inert", () => {
    const html = renderCategory(true);

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-hidden="false"');
    expect(html).not.toMatch(/\sinert(?:=|>)/);
    expect(html).toContain("No quest is underway right now.");
  });
});
