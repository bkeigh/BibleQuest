import { expect, test, type Page } from "@playwright/test";
import { currentSnapshot } from "../fixtures";

// Challenges the controlling worker through its bounded public message contract.
async function workerVersion(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const worker = navigator.serviceWorker.controller ?? registration.active;
    if (!worker) throw new Error("No active BibleQuest service worker");

    return new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Service-worker version challenge timed out")),
        5_000,
      );
      const receive = (event: MessageEvent) => {
        if (event.data?.type !== "BIBLEQUEST_SW_VERSION_RESPONSE") return;
        window.clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener("message", receive);
        resolve(event.data.version as string);
      };
      navigator.serviceWorker.addEventListener("message", receive);
      worker.postMessage({ type: "BIBLEQUEST_SW_VERSION_REQUEST" });
    });
  });
}

// Proves a returning local-first user retains the app shell while sensitive or
// query-bearing offline navigations receive the script-free neutral fallback.
test("the installed worker keeps offline state usable and private", async ({
  context,
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
  // Walk the one-time legacy keep decision so the v2 namespace adopts the
  // seeded journey before offline behaviour is measured.
  await page
    .getByRole("button", { name: "Keep this local journey" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Fixture Person" }),
  ).toBeVisible();
  await page.evaluate(async () => navigator.serviceWorker.ready);

  // Reload once under worker control so the current build chunks enter only
  // the reviewed runtime cache before the connection disappears.
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Fixture Person" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  expect(await workerVersion(page)).toBe("biblequest-v28");

  await context.setOffline(true);
  const cachedApp = await page.goto("/app", { waitUntil: "domcontentloaded" });
  expect(cachedApp?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Fixture Person" }),
  ).toBeVisible();
  await expect(page.getByText("fixture-prayer-body")).toHaveCount(0);

  for (const pathname of [
    "/app/account",
    "/api/health",
    "/app?qa=1",
    "/auth/callback?code=fake",
  ]) {
    const fallback = await page.goto(pathname, {
      waitUntil: "domcontentloaded",
    });
    expect(fallback?.status(), pathname).toBe(503);
    await expect(
      page.getByRole("heading", { level: 1, name: "No connection" }),
      pathname,
    ).toBeVisible();
    await expect(page.getByText("Saved pages and drafts are still here."))
      .toBeVisible();
    await expect(page.getByText("Something didn’t load correctly"))
      .toHaveCount(0);
    await expect(page.getByText("fixture-prayer-body")).toHaveCount(0);
    await expect(page.getByText("fixture-reflection-body")).toHaveCount(0);
  }

  const cacheNames = await page.evaluate(async () => (await caches.keys()).sort());
  expect(cacheNames).toEqual([
    "biblequest-v28-runtime",
    "biblequest-v28-shell",
  ]);
});
