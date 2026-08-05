import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Reads one checked-in route or rollout file for boundary assertions. */
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("private push API boundary", () => {
  const mutationRoutes = [
    "src/app/api/push/preferences/route.ts",
    "src/app/api/push/subscriptions/route.ts",
    "src/app/api/push/test/route.ts",
  ];

  it("authenticates every browser route and protects each mutation origin", () => {
    for (const path of [
      "src/app/api/push/config/route.ts",
      ...mutationRoutes,
    ]) {
      expect(source(path)).toContain("authenticatedServerContext(request)");
      expect(source(path)).toContain("pushContractReady(");
    }
    for (const path of mutationRoutes) {
      expect(source(path)).toContain("hasSameOrigin(request)");
      expect(source(path)).toContain("boundedJson(");
    }
  });

  it("keeps endpoint material sealed and test sends owner-bound", () => {
    const subscriptionRoute = source(
      "src/app/api/push/subscriptions/route.ts",
    );
    const testRoute = source("src/app/api/push/test/route.ts");
    const configRoute = source("src/app/api/push/config/route.ts");

    expect(subscriptionRoute).toContain("encryptPushSubscription(subscription)");
    expect(testRoute).toContain('.eq("user_id", context.user.id)');
    expect(testRoute.indexOf('.from("push_subscriptions")')).toBeLessThan(
      testRoute.indexOf('"claim_push_test"'),
    );
    expect(configRoute).not.toContain("encrypted_subscription");
    expect(configRoute).not.toContain("endpoint_fingerprint");
    expect(configRoute).not.toContain("WEB_PUSH_VAPID_PRIVATE_KEY");
  });

  it("schedules only behind two explicit rollout gates", () => {
    const route = source("src/app/api/push/schedule/route.ts");
    const workflow = source(".github/workflows/push-reminders.yml");

    expect(route).toContain("schedulerAuthorized(request)");
    expect(route).toContain("pushFeatureEnabled()");
    expect(route).toContain("timingSafeEqual");
    expect(workflow).toContain("BIBLEQUEST_PUSH_SCHEDULE_ENABLED");
    expect(workflow).toContain("secrets.PUSH_SCHEDULER_SECRET");
    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
    expect(workflow).not.toMatch(/echo[^\\n]*PUSH_SCHEDULER_SECRET/i);
  });

  it("never requests notification permission during passive setup", () => {
    const client = source("src/lib/push/client.ts");
    const platform = source("src/lib/platform/notifications.ts");
    const settings = source(
      "src/components/settings/ReminderSettings.tsx",
    );

    expect(platform.match(/Notification\.requestPermission\(\)/g)).toHaveLength(
      1,
    );
    expect(
      client.indexOf("notificationCapability().requestPermission()"),
    ).toBeGreaterThan(
      client.indexOf("export async function enablePushReminders"),
    );
    expect(settings).not.toContain("Notification.requestPermission");
  });
});
