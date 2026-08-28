import { expect, test } from "@playwright/test";

test("the language wheel is one keyboard stop with native arrow movement", async ({
  page,
}) => {
  await page.goto("/onboarding");

  // Waits for private storage restoration before exercising the first-use UI.
  await expect(page.getByText("Restoring your journey")).toBeHidden({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Continue on this device" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your language and Bible" }),
  ).toBeVisible();

  const radios = page.locator('input[name="onboarding-language"]');
  const english = radios.nth(0);
  const spanish = radios.nth(1);

  // The checked radio alone participates in sequential keyboard navigation.
  await expect
    .poll(() => radios.evaluateAll((items) => items.map((item) => item.tabIndex)))
    .toEqual([0, ...Array.from({ length: 18 }, () => -1)]);

  await english.focus();
  await page.keyboard.press("ArrowDown");
  await expect(spanish).toBeChecked();
  await expect
    .poll(() => radios.evaluateAll((items) => items.map((item) => item.tabIndex)))
    .toEqual([-1, 0, ...Array.from({ length: 17 }, () => -1)]);

  // Tab leaves the language group for the selected Bible radio group.
  await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      page.evaluate(
        () => (document.activeElement as HTMLInputElement | null)?.name,
      ),
    )
    .toBe("onboarding-bible");
});
