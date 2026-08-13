import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORKFLOW = readFileSync(".github/workflows/ci.yml", "utf8");

/** Returns one top-level job block from the checked-in CI workflow. */
function jobBlock(jobId: string): string {
  const marker = `  ${jobId}:\n`;
  const start = WORKFLOW.indexOf(marker);
  expect(start, `missing CI job ${jobId}`).toBeGreaterThanOrEqual(0);

  const rest = WORKFLOW.slice(start + marker.length);
  const nextJob = rest.search(/^  [a-z0-9-]+:\n/m);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

describe("protected CI release gate", () => {
  it("keeps Quality closed until every in-repository release lane succeeds", () => {
    const sourceQuality = jobBlock("source-quality");
    const quality = jobBlock("quality");
    const requiredLanes = [
      "source-quality",
      "types-and-tests",
      "production-build",
      "native-export",
      "ios-simulator-build",
      "browser-smoke",
      "database-policies",
      "dependency-risk",
    ];

    expect(sourceQuality).toContain("    name: Source quality");
    expect(quality).toContain("    name: Quality");
    expect(quality).toContain("    if: always()");
    for (const lane of requiredLanes) {
      expect(quality, lane).toContain(`      - ${lane}`);
    }
    expect(quality).toContain('job.result !== "success"');
    expect(WORKFLOW.indexOf("  quality:\n")).toBeGreaterThan(
      WORKFLOW.indexOf("  dependency-risk:\n"),
    );
  });
});
