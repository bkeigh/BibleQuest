import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Reads a client surface for stable paid-entry behavior assertions. */
function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Plus feature invitation", () => {
  it("provides one accessible, dismissible Explore Plus dialog", () => {
    const dialog = source("src/components/plus/PlusFeatureDialog.tsx");

    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('href="/app/plus"');
    expect(dialog).toContain("Explore Plus");
    expect(dialog).toContain('event.key === "Escape"');
    expect(dialog).toContain("previouslyFocused.focus()");
  });

  it("uses the dialog from primary paid feature entry points", () => {
    for (const path of [
      "src/components/settings/WallpaperPicker.tsx",
      "src/components/guided/PilgrimageCatalog.tsx",
      "src/components/games/GamesScreen.tsx",
      "src/components/rhythm/RhythmBuilder.tsx",
    ]) {
      expect(source(path)).toContain("PlusFeatureDialog");
    }
  });

  it("labels artwork as Plus without labeling parchment Free", () => {
    const picker = source("src/components/settings/WallpaperPicker.tsx");

    expect(picker).toContain("Every artwork scene is included with Plus");
    expect(picker).toContain("Parchment");
    expect(picker).not.toContain(">Free<");
    expect(picker).not.toContain('"Free"');
  });
});
