import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Reads public support copy so native and web storage boundaries cannot drift. */
const CONTACT_PAGE = readFileSync(
  "src/app/(marketing)/contact/page.tsx",
  "utf8",
);

describe("public contact data copy", () => {
  it("explains native guest storage and explicit Prayer adoption", () => {
    expect(CONTACT_PAGE).toContain("protected local app storage");
    expect(CONTACT_PAGE).toContain("excluded from device backups");
    expect(CONTACT_PAGE).toContain("Signing in does");
    expect(CONTACT_PAGE).toContain("Prayer journal entries you explicitly adopt");
  });

  it("distinguishes native controls from web controls", () => {
    expect(CONTACT_PAGE).toContain("clear guest data");
    expect(CONTACT_PAGE).toContain("delete the account");
    expect(CONTACT_PAGE).toContain("Web Settings provides");
    expect(CONTACT_PAGE).toContain("export, clearing, and");
  });
});
