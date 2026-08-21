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

/** Returns one named step block from a previously selected CI job. */
function stepBlock(job: string, stepName: string): string {
  const marker = `      - name: ${stepName}\n`;
  const start = job.indexOf(marker);
  expect(start, `missing CI step ${stepName}`).toBeGreaterThanOrEqual(0);

  const rest = job.slice(start + marker.length);
  const nextStep = rest.search(/^      - name:/m);
  return nextStep === -1 ? rest : rest.slice(0, nextStep);
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

  // Keeps browser setup away from slow operating-system mirrors and bounds downloads.
  it("fails a stalled Chromium install before the browser job is cancelled", () => {
    const browserSmoke = jobBlock("browser-smoke");
    const chromiumInstall = stepBlock(browserSmoke, "Install Chromium runtime");

    expect(browserSmoke).toContain("    timeout-minutes: 25");
    expect(chromiumInstall).toContain("        timeout-minutes: 5");
    expect(chromiumInstall).toContain(
      "        run: pnpm exec playwright install chromium",
    );
    expect(chromiumInstall).not.toContain("--with-deps");
  });
});
