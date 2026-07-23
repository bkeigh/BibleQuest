import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeQuestDisclosure } from "@/components/home/HomeQuestDisclosure";

/** Renders the disclosure without requiring a browser event loop. */
function renderDisclosure(defaultOpen: boolean) {
  const props = {
    title: "Today’s quests",
    summary: "1 active · 1 complete",
    announcement: "One of two complete",
    defaultOpen,
    children: createElement("p", null, "Quest details"),
  };

  return renderToStaticMarkup(
    createElement(HomeQuestDisclosure, props),
  );
}

describe("HomeQuestDisclosure", () => {
  it("exposes one labelled button and an inert closed region", () => {
    const html = renderDisclosure(false);
    const contentId = html.match(/aria-controls="([^"]+)"/)?.[1];

    expect(contentId).toBeTruthy();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("inert");
    expect(html).toContain(`id="${contentId}"`);
    expect(html).toContain('role="region"');
    expect(html).toContain("1 active · 1 complete");
  });

  it("keeps details available when the empty state starts open", () => {
    const html = renderDisclosure(true);

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-hidden="false"');
    expect(html).not.toMatch(/\sinert(?:=|>)/);
    expect(html).toContain("Quest details");
  });
});
