import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JournalEntryBody } from "@/components/journal/JournalEntryBody";
import {
  applyJournalFormat,
  countJournalWords,
} from "@/components/journal/JournalEditorToolbar";

describe("journal composer formatting", () => {
  it("formats the range captured before a touch moves focus", () => {
    const bold = applyJournalFormat(
      "Grace meets me here.",
      { start: 0, end: 5 },
      "bold",
    );
    const list = applyJournalFormat(
      "first mercy\nsecond mercy",
      { start: 0, end: 25 },
      "list",
    );

    expect(bold).toEqual({
      value: "**Grace** meets me here.",
      selection: { start: 2, end: 7 },
    });
    expect(list).toEqual({
      value: "- first mercy\n- second mercy",
      selection: { start: 2, end: 28 },
    });
  });

  it("toggles inline styles without turning repeated italic into bold", () => {
    const italic = applyJournalFormat("Grace", { start: 0, end: 5 }, "italic");
    const plainAgain = applyJournalFormat(
      italic.value,
      italic.selection,
      "italic",
    );
    const bold = applyJournalFormat("Grace", { start: 0, end: 5 }, "bold");
    const boldItalic = applyJournalFormat(
      bold.value,
      bold.selection,
      "italic",
    );

    expect(italic.value).toBe("*Grace*");
    expect(plainAgain).toEqual({
      value: "Grace",
      selection: { start: 0, end: 5 },
    });
    expect(boldItalic.value).toBe("***Grace***");
    expect(
      renderToStaticMarkup(
        JournalEntryBody({ children: boldItalic.value }),
      ),
    ).toContain("<strong><em>Grace</em></strong>");
  });

  it("keeps multi-line formatting inside the renderer's line boundaries", () => {
    const result = applyJournalFormat(
      "Grace\nPeace",
      { start: 0, end: 11 },
      "bold",
    );
    const markup = renderToStaticMarkup(
      JournalEntryBody({ children: result.value }),
    );

    expect(result.value).toBe("**Grace**\n**Peace**");
    expect(markup.match(/<strong>/g)).toHaveLength(2);
    expect(markup).not.toContain("**");
  });

  it("does not insert unexplained markers when no inline text is selected", () => {
    expect(applyJournalFormat("Grace", { start: 5, end: 5 }, "bold")).toEqual({
      value: "Grace",
      selection: { start: 5, end: 5 },
    });
  });

  it("keeps the touch range and opens a visible preview after formatting", () => {
    const toolbar = readFileSync(
      "src/components/journal/JournalEditorToolbar.tsx",
      "utf8",
    );

    // Pointer-down runs before a mobile browser transfers focus to the button.
    expect(toolbar).toContain("onPointerDown={(event)");
    expect(toolbar).toContain("event.preventDefault()");
    expect(toolbar).toContain("setPreviewOpen(true)");
    expect(toolbar).toContain('aria-label="Entry preview"');
    expect(toolbar).toContain("Select text, then choose a style.");
    expect(toolbar).toContain("Select text first to make it");
  });

  it("counts words without counting formatting markers", () => {
    expect(countJournalWords("**Grace** and *peace*\n- today")).toBe(4);
  });
});

describe("journal formatting renderer", () => {
  it("previews the same safe vocabulary used by saved entries", () => {
    const markup = renderToStaticMarkup(
      JournalEntryBody({
        children:
          "**Grace** and *peace*\n- first mercy\n- second mercy\n> Be still",
      }),
    );

    expect(markup).toContain("<strong>Grace</strong>");
    expect(markup).toContain("<em>peace</em>");
    expect(markup).toContain("<ul");
    expect(markup).toContain("<blockquote");
  });

  it("renders journal text as text rather than executable markup", () => {
    const markup = renderToStaticMarkup(
      JournalEntryBody({ children: '<script>alert("private")</script>' }),
    );

    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
  });
});
