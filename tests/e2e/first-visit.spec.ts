import { expect, test } from "@playwright/test";

/**
 * The plainest possible journey: someone opens BibleQuest for the first time
 * with nothing in storage. Every other browser journey seeds a legacy journey
 * first, which enters the app through the ambiguous-legacy recovery branch and
 * leaves this path — the one every genuinely new visitor takes — untested.
 */
test("a first visit with empty storage renders the app", async ({ page }) => {
  await page.goto("/app");

  // The gate must resolve to real UI rather than sitting on the loading veil.
  await expect(
    page.getByText("Restoring your journey"),
    "the app never left the loading veil on a first visit",
  ).toBeHidden({ timeout: 20_000 });

  await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
});

test("a first visit to onboarding renders the app", async ({ page }) => {
  await page.goto("/onboarding");

  await expect(
    page.getByText("Restoring your journey"),
    "onboarding never left the loading veil on a first visit",
  ).toBeHidden({ timeout: 20_000 });

  await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
});

/** Exercises the first-use handoff that previously stopped at the loading veil. */
test("a first journey reaches Today after choosing its starter quest", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/onboarding");

  await page.getByRole("button", { name: "Continue on this device" }).click();
  await page.getByLabel("First name").fill("Friend");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your language and Bible" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page
    .getByRole("button", { name: "Add this quest to today" })
    .click();

  await expect(page).toHaveURL(/\/app$/, { timeout: 10_000 });
  await expect(page.locator("#for-today-home-title")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Restoring your journey")).toBeHidden();
});
