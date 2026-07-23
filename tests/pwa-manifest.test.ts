import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("installed BibleQuest manifest", () => {
  it("keeps one stable, fully scoped app identity", () => {
    const value = manifest();

    expect(value.id).toBe("/app");
    expect(value.start_url).toBe("/app");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
  });
});
