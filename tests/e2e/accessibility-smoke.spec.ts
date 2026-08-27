import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { currentSnapshot } from "../fixtures";

const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
] as const;

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ html: string; target: string[] }>;
}

// Runs axe inside the optimized browser build and keeps failures free of app data.
async function expectNoWcagViolations(page: Page, surface: string) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async (tags) => {
    const runner = (
      window as typeof window & {
        axe: {
          run: (
            root: Document,
            options: { runOnly: { type: "tag"; values: readonly string[] } },
          ) => Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    const result = await runner.run(document, {
      runOnly: { type: "tag", values: tags },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        target: node.target,
      })),
    }));
  }, WCAG_TAGS);

  expect(
    violations,
    `${surface} has WCAG A/AA violations:\n${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

// Installs a synthetic completed journey and accepts the one-time legacy handoff.
async function openSyntheticJourney(page: Page) {
  const snapshot = currentSnapshot();
  await page.addInitScript((journey) => {
    localStorage.setItem(
      "biblequest:v1",
      JSON.stringify({ state: journey, version: 18 }),
    );
  }, snapshot);
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Keep this local journey" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Fixture Person" }),
  ).toBeVisible();
}

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
});

// Makes the scan cover the calm-motion path shipped for accessibility users.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("first-run onboarding has no automated WCAG A/AA violations", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/onboarding");
  await expect(
    page.getByRole("progressbar", { name: "Onboarding progress" }),
  ).toBeVisible();
  await page.waitForFunction(() => {
    const heading = document.querySelector("main h1");
    let current: Element | null = heading;
    while (current) {
      if (Number.parseFloat(getComputedStyle(current).opacity) < 1) return false;
      current = current.parentElement;
    }
    return Boolean(heading);
  });

  await expectNoWcagViolations(page, "first-run onboarding");
});

test("daily faith surfaces have no automated WCAG A/AA violations", async ({
  page,
}) => {
  await openSyntheticJourney(page);

  const surfaces = [
    { name: "Today", path: "/app" },
    { name: "Quests", path: "/app/quests" },
    { name: "Bible", path: "/app/bible" },
    { name: "Prayers", path: "/app/prayer" },
    { name: "Journey", path: "/app/journey" },
    { name: "Settings", path: "/app/settings" },
  ];

  for (const surface of surfaces) {
    await page.goto(surface.path);
    await expect(page.locator("main")).toBeVisible();
    await expectNoWcagViolations(page, surface.name);
  }
});

test("compact and 200% zoom layouts do not overflow or fail WCAG", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 1136 });
  await openSyntheticJourney(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow, "Today overflows horizontally at 200% zoom").toBeLessThanOrEqual(1);
  await expectNoWcagViolations(page, "Today at 200% zoom");
});
