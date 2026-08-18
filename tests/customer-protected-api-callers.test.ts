import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Reads one browser caller for transport-boundary assertions. */
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("customer protected API callers", () => {
  it("uses the expected-subject bearer helper for AI and arcade", () => {
    for (const path of [
      "src/components/quests/QuestGenerator.tsx",
      "src/components/shepherd/MyShepherd.tsx",
      "src/components/shepherd/FloatingMyShepherd.tsx",
      "src/lib/games/arcade/useArcadeAccess.ts",
    ]) {
      const value = source(path);
      expect(value, path).toContain("authenticatedApiFetch");
      expect(value, path).not.toMatch(/\bapiFetch\(/);
    }
    for (const path of [
      "src/components/shepherd/MyShepherd.tsx",
      "src/components/shepherd/FloatingMyShepherd.tsx",
    ]) {
      expect(source(path), path).toContain('key={user?.id ?? "guest"}');
    }
  });

  it("binds billing and push calls to the visible session subject", () => {
    const billing = source("src/lib/billing/usePlus.ts");
    const purchases = source("src/lib/platform/purchases.ts");
    const push = source("src/lib/push/client.ts");
    const reminders = source("src/components/settings/ReminderSettings.tsx");

    expect(billing).toContain("authenticatedBillingFetch(expectedUserId");
    expect(billing).toContain("purchases.restore(session.user.id)");
    expect(billing).toContain("purchases.purchase(session.user.id, interval)");
    expect(billing).toContain("purchases.manage(session.user.id)");
    expect(purchases).toContain("authenticatedApiFetch");
    expect(push).toContain("authenticatedApiFetch");
    expect(push).not.toMatch(/\bapiFetch\(/);
    expect(reminders).toContain("userId={user?.id ?? null}");
    expect(reminders).toContain("fetchPushConfig(userId,");
    expect(reminders).toContain("enablePushReminders(userId,");
    expect(reminders).toContain("savePushPreferences(userId,");
    expect(reminders).toContain("disablePushReminders(userId,");
    expect(reminders).toContain("sendTestPush(userId,");
  });

  it("keeps support checkout anonymous at both caller and route", () => {
    const client = source("src/components/plus/SupportCheckout.tsx");
    const route = source("src/app/api/support/checkout/route.ts");

    expect(client).toContain('apiFetch("/api/support/checkout"');
    expect(client).not.toContain('credentials: "same-origin"');
    expect(route).toContain("userId: null");
    expect(route).not.toContain("createServerSupabase");
    expect(route).not.toContain("customer_email");
  });
});
