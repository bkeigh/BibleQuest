import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_HREF,
} from "@/lib/brand";
import { LegalSummary } from "@/components/legal/LegalSummary";

/** Reads tracked-style source files recursively so stale contact copy cannot hide. */
function sourceText(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceText(entryPath);
      if (!/\.(?:ts|tsx|mjs)$/.test(entry.name)) return [];
      return readFileSync(entryPath, "utf8");
    })
    .join("\n");
}

describe("public support contact", () => {
  it("uses the verified Proton inbox and no stale public address", () => {
    expect(SUPPORT_EMAIL).toBe("biblequestco@proton.me");
    expect(SUPPORT_EMAIL_HREF).toBe("mailto:biblequestco@proton.me");

    const source = sourceText(path.join(process.cwd(), "src"));
    expect(source).not.toContain("hello@biblequest.co");
  });

  it("renders the corrected inbox in both legal documents", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(LegalSummary, { kind: "privacy" }),
        createElement(LegalSummary, { kind: "terms" }),
      ),
    );

    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain(SUPPORT_EMAIL_HREF);
  });
});
