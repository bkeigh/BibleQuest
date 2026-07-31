import { describe, expect, it } from "vitest";
import {
  parsePublicFeatureFlag,
  resolveGreenFeatureFlags,
} from "@/lib/features/green";

describe("Green feature rollout flags", () => {
  it("defaults the isolated branch features on", () => {
    expect(resolveGreenFeatureFlags({})).toEqual({
      guidedScripture: true,
      pilgrimages: true,
      games: true,
      scriptureConnections: true,
      bibleTimeline: true,
      rhythmBuilder: true,
    });
  });

  it("lets the master switch disable every child", () => {
    expect(
      resolveGreenFeatureFlags({
        master: "false",
        guidedScripture: "true",
        games: "true",
      }),
    ).toEqual({
      guidedScripture: false,
      pilgrimages: false,
      games: false,
      scriptureConnections: false,
      bibleTimeline: false,
      rhythmBuilder: false,
    });
  });

  it("supports independent feature rollback", () => {
    expect(
      resolveGreenFeatureFlags({
        pilgrimages: "false",
        bibleTimeline: "false",
      }),
    ).toMatchObject({
      guidedScripture: true,
      pilgrimages: false,
      games: true,
      scriptureConnections: true,
      bibleTimeline: false,
      rhythmBuilder: true,
    });
  });

  it("keeps individual games beneath the games parent switch", () => {
    expect(resolveGreenFeatureFlags({ games: "false" })).toMatchObject({
      games: false,
      scriptureConnections: false,
      bibleTimeline: false,
    });
  });

  it("fails malformed values closed", () => {
    expect(parsePublicFeatureFlag("TRUE", true)).toBe(false);
    expect(parsePublicFeatureFlag("yes", true)).toBe(false);
    expect(parsePublicFeatureFlag("", true)).toBe(false);
  });
});
