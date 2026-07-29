import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

/** Reads a Green route or component as deployment-boundary evidence. */
function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("guided route and access boundaries", () => {
  it("keeps Guided Scripture and Pilgrimages behind independent flags", () => {
    expect(source("src/app/app/guided/page.tsx")).toContain(
      "GREEN_FEATURES.guidedScripture",
    );
    expect(source("src/app/app/guided/daily/page.tsx")).toContain(
      "GREEN_FEATURES.guidedScripture",
    );
    expect(source("src/app/app/pilgrimages/page.tsx")).toContain(
      "GREEN_FEATURES.pilgrimages",
    );
    expect(source("src/app/app/pilgrimages/[slug]/page.tsx")).toContain(
      "GREEN_FEATURES.pilgrimages",
    );
    expect(source("src/app/app/pilgrimages/[slug]/[day]/page.tsx")).toContain(
      "GREEN_FEATURES.pilgrimages",
    );
    expect(source("src/components/guided/GuidedHub.tsx")).toContain(
      "GREEN_FEATURES.pilgrimages",
    );
  });

  it("does not flash Plus content while entitlement is loading", () => {
    const detail = source("src/components/guided/PilgrimageDetail.tsx");
    const day = source("src/components/guided/PilgrimageDay.tsx");

    expect(detail).toContain("plus.loading");
    expect(detail).toContain("Checking Plus access");
    expect(day).toContain("plus.loading");
    expect(day).toContain("Checking Plus access");
  });

  it("guards direct day URLs until the previous day is complete", () => {
    const day = source("src/components/guided/PilgrimageDay.tsx");

    expect(day).toContain("previousComplete");
    expect(day).toContain("currentStarted");
    expect(day).toContain("!previousComplete && !currentStarted");
    expect(day).toContain("Return to the path");
  });

  it("keeps guide completion separate from Journey and growth", () => {
    const runner = source("src/components/guided/GuidedPracticeRunner.tsx");
    const store = source("src/lib/questos/store.ts");

    expect(runner).not.toContain("recordAction(");
    expect(runner).not.toContain("appendGrowth");
    expect(store).toContain("startGuidedSession:");
    expect(store).toContain("completeGuidedMovement:");
  });

  it("focuses the completion result and hands off reviewed ids only", () => {
    const runner = source("src/components/guided/GuidedPracticeRunner.tsx");

    expect(runner).toContain("completionHeading.current?.focus");
    expect(runner).not.toContain("preventScroll");
    expect(runner).toContain("?guided=${encodeURIComponent(practice.id)}");
    expect(runner).toContain("Open Reflection Journal");
    expect(runner).toContain("Open Prayer Journal");
    expect(runner).not.toContain("?prompt=${practice.");
  });
});
