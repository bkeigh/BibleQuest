import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Reads the public support copy so guest-only wording cannot hide account sync. */
const CONTACT_PAGE = readFileSync(
  "src/app/(marketing)/contact/page.tsx",
  "utf8",
);

describe("public contact data copy", () => {
  it("explains both guest storage and optional account sync", () => {
    expect(CONTACT_PAGE).toContain(
      "Guest use may keep journey data on your device",
    );
    expect(CONTACT_PAGE).toContain("sign in to a supported BibleQuest");
    expect(CONTACT_PAGE).toContain("sync to that protected");
    expect(CONTACT_PAGE).not.toContain(
      "stores your journey locally and does not send it to",
    );
  });

  it("names the Settings data paths without promising deletion results", () => {
    expect(CONTACT_PAGE).toContain("export or clear journey data");
    expect(CONTACT_PAGE).toContain("request account deletion");
  });
});
