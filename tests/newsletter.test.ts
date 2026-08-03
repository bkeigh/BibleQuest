import { describe, expect, it } from "vitest";
import {
  TALLY_NEWSLETTER_EMBED_URL,
  TALLY_NEWSLETTER_URL,
} from "@/lib/newsletter";

describe("newsletter destinations", () => {
  it("keeps the public and embedded forms on the same Tally form", () => {
    const publicUrl = new URL(TALLY_NEWSLETTER_URL);
    const embedUrl = new URL(TALLY_NEWSLETTER_EMBED_URL);

    expect(publicUrl.protocol).toBe("https:");
    expect(publicUrl.hostname).toBe("tally.so");
    expect(embedUrl.protocol).toBe("https:");
    expect(embedUrl.hostname).toBe("tally.so");
    expect(embedUrl.pathname.split("/").at(-1)).toBe(
      publicUrl.pathname.split("/").at(-1),
    );
  });
});
