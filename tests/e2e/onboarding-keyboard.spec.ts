import { expect, test, type Page } from "@playwright/test";

// Opens the first-use language step after private storage has restored.
async function openLanguageStep(page: Page) {
  await page.goto("/onboarding");
  await expect(page.getByText("Restoring your journey")).toBeHidden({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Continue on this device" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your language and Bible" }),
  ).toBeVisible();
}

test("the language wheel is one keyboard stop with native arrow movement", async ({
  page,
}) => {
  await openLanguageStep(page);

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

test("the iPhone layout centers Bible editions beneath a five-row wheel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await openLanguageStep(page);

  // A standard-height iPhone shows five 48px wheel rows around the selection.
  await expect(page.locator(".wheel")).toHaveCSS("height", "240px");
  await expect(page.locator(".wheel-label").first()).toHaveCSS(
    "text-align",
    "center",
  );

  // The fieldset, edition chips, and selected-edition caption share one axis.
  const bibleGroup = page.getByRole("group", { name: "The Bible edition" });
  await expect(bibleGroup).toHaveCSS("text-align", "center");
  await expect(bibleGroup.locator("div").first()).toHaveCSS(
    "justify-content",
    "center",
  );
  await expect(page.getByText("King James Version · English")).toHaveCSS(
    "text-align",
    "center",
  );
});
