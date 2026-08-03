import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

// Runs the browser suite against the same optimized server shape deployed by Vercel.
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `pnpm build && pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://header-fixture.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "header-fixture-anon-key",
      NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED: "false",
      STRIPE_BILLING_MODE: "coming-soon",
      BIBLEQUEST_STRIPE_PURCHASES_ENABLED: "false",
      BIBLEQUEST_STRIPE_SUPPORT_ENABLED: "false",
    },
  },
});
