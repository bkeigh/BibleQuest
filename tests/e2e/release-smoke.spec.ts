import { expect, test } from "@playwright/test";
import { currentSnapshot } from "../fixtures";

test("public marketing remains visible, private, and portfolio-frameable", async ({
  page,
}) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Bring faith into the life you live/i,
    }),
  ).toBeVisible();

  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain(
    "frame-ancestors 'self' https://winterhill.studio https://www.winterhill.studio",
  );
  expect(response?.headers()["x-frame-options"]).toBeUndefined();

  // Keeps Tally code isolated from private browser storage in the parent page.
  await expect(page.locator('script[src*="tally.so"]')).toHaveCount(0);
  const newsletter = page.getByTitle("Join the BibleQuest newsletter");
  await expect(newsletter).toHaveAttribute(
    "sandbox",
    "allow-forms allow-popups allow-same-origin allow-scripts",
  );
  await expect(newsletter).toHaveAttribute("referrerpolicy", "no-referrer");

  // Exercise in-view animation so below-fold release content cannot stay blank.
  for (const heading of [
    /Most people don’t lack access to Scripture/i,
    /Read\. Pray\. Reflect\. Act\./i,
    /Your journey grows with you/i,
    /Prayers and reflections, private by default/i,
    /Everyone’s walk with God is different/i,
  ]) {
    const sectionHeading = page.getByRole("heading", { level: 2, name: heading });
    await sectionHeading.scrollIntoViewIfNeeded();
    await expect(sectionHeading).toBeVisible();
  }
});

test("onboarding exposes landmarks and denies framing", async ({ page }) => {
  const response = await page.goto("/onboarding");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "Onboarding progress" }),
  ).toBeVisible();
  await expect(page.locator("img[data-art-mascot]").first()).toBeVisible();

  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
});

// Home stays compact and cached routes resume the latest local-first profile.
test("Home starts compactly and profile changes follow cached routes", async ({
  page,
}) => {
  const snapshot = currentSnapshot();
  await page.addInitScript((journey) => {
    localStorage.setItem(
      "biblequest:v1",
      JSON.stringify({ state: journey, version: 18 }),
    );
  }, snapshot);

  await page.goto("/app");
  // A device carrying legacy private bytes gets exactly one explicit
  // keep-or-clear decision before the v2 namespace adopts them; this is the
  // upgrade path every existing guest walks once.
  await page
    .getByRole("button", { name: "Keep this local journey" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Fixture Person" }),
  ).toBeVisible();
  const profileCard = page.locator("header[data-plus-nameplate]");
  const profileCardBox = await profileCard.boundingBox();
  expect(profileCardBox?.y).toBeLessThanOrEqual(20);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Display name").fill("Updated Person");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("link", { name: "Home", exact: true }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Updated Person" }),
  ).toBeVisible();
});
