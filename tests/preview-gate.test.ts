import { describe, expect, it } from "vitest";
import {
  PREVIEW_GATE_SESSION_KEY,
  TALLY_WAITLIST_EMBED_URL,
  TALLY_WAITLIST_SCRIPT_URL,
  isPreviewGatePath,
  isPreviewPasswordAccepted,
} from "@/lib/preview-gate";

describe("temporary homepage preview gate", () => {
  it("accepts only the configured preview password", () => {
    expect(isPreviewPasswordAccepted("biblequest123")).toBe(true);
    expect(isPreviewPasswordAccepted("  biblequest123  ")).toBe(true);
    expect(isPreviewPasswordAccepted("BibleQuest123")).toBe(false);
    expect(isPreviewPasswordAccepted("biblequest12")).toBe(false);
    expect(isPreviewPasswordAccepted("")).toBe(false);
  });

  it("uses a versioned session grant rather than a persistent local grant", () => {
    expect(PREVIEW_GATE_SESSION_KEY).toBe("biblequest:preview-home:v1");
  });

  it("gates only the root marketing page", () => {
    expect(isPreviewGatePath("/")).toBe(true);
    expect(isPreviewGatePath("/about")).toBe(false);
    expect(isPreviewGatePath("/privacy")).toBe(false);
    expect(isPreviewGatePath("/app")).toBe(false);
  });

  it("embeds the published BibleQuest form from the exact Tally origin", () => {
    const embedUrl = new URL(TALLY_WAITLIST_EMBED_URL);

    expect(embedUrl.origin).toBe("https://tally.so");
    expect(embedUrl.pathname).toBe("/embed/J9xpP4");
    expect(embedUrl.searchParams.get("alignLeft")).toBe("1");
    expect(embedUrl.searchParams.get("hideTitle")).toBe("1");
    expect(embedUrl.searchParams.get("transparentBackground")).toBe("1");
    expect(embedUrl.searchParams.get("dynamicHeight")).toBe("1");
    expect(TALLY_WAITLIST_SCRIPT_URL).toBe("https://tally.so/widgets/embed.js");
  });
});
