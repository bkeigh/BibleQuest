import { expect, test } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
});

// Confirms the shipped CSS keeps every keyboard control above iOS's zoom threshold.
test("touch form controls stay at least 16px without locking page zoom", async ({
  page,
}) => {
  const response = await page.goto("/onboarding");
  expect(response?.ok()).toBe(true);
  expect(
    await page.evaluate(() =>
      matchMedia("(hover: none) and (pointer: coarse)").matches,
    ),
  ).toBe(true);

  const sizes = await page.evaluate(() => {
    const inputTypes = [
      "date",
      "datetime-local",
      "email",
      "month",
      "number",
      "password",
      "search",
      "tel",
      "text",
      "time",
      "url",
      "week",
    ];
    const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> =
      inputTypes.map((type) => {
        const input = document.createElement("input");
        input.type = type;
        return input;
      });
    controls.push(document.createElement("textarea"), document.createElement("select"));

    return controls.map((control) => {
      document.body.appendChild(control);
      const result = {
        control: control.tagName.toLowerCase(),
        fontSize: Number.parseFloat(getComputedStyle(control).fontSize),
      };
      control.remove();
      return result;
    });
  });

  for (const size of sizes) {
    expect(size.fontSize, `${size.control} can trigger iOS focus zoom`).toBeGreaterThanOrEqual(16);
  }

  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toMatch(/maximum-scale|user-scalable=no/i);
});
