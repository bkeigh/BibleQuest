import { beforeEach, describe, expect, it, vi } from "vitest";

const webPushMocks = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({
  default: webPushMocks,
}));

import {
  pushVapidPublicKey,
  sendNeutralPush,
} from "@/lib/push/delivery.server";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/opaque",
  expirationTime: null,
  keys: {
    p256dh: "A".repeat(87),
    auth: "B".repeat(22),
  },
};

describe("neutral Web Push delivery", () => {
  beforeEach(() => {
    vi.stubEnv("WEB_PUSH_VAPID_SUBJECT", "mailto:ops@biblequest.test");
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", "A".repeat(87));
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "B".repeat(43));
    webPushMocks.sendNotification.mockResolvedValue({ statusCode: 201 });
  });

  it("sends only a bounded kind with one-hour TTL", async () => {
    await expect(
      sendNeutralPush(subscription, "prayer_reminder"),
    ).resolves.toMatchObject({
      outcome: "sent",
      category: "ok",
      removeSubscription: false,
    });
    expect(webPushMocks.sendNotification).toHaveBeenCalledWith(
      subscription,
      JSON.stringify({ version: 1, kind: "prayer_reminder" }),
      { TTL: 3600, urgency: "normal" },
    );
    expect(
      webPushMocks.sendNotification.mock.calls[0][1],
    ).not.toMatch(/body|journal|title|text/i);
  });

  it("deletes expired endpoints and retries bounded provider failures", async () => {
    webPushMocks.sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    await expect(
      sendNeutralPush(subscription, "daily_verse"),
    ).resolves.toMatchObject({
      outcome: "permanent_failure",
      category: "expired",
      removeSubscription: true,
    });

    webPushMocks.sendNotification.mockRejectedValueOnce({ statusCode: 503 });
    await expect(
      sendNeutralPush(subscription, "daily_quest"),
    ).resolves.toMatchObject({
      outcome: "transient_failure",
      category: "provider",
      retryAfterSeconds: 300,
    });

    webPushMocks.sendNotification.mockRejectedValueOnce({ statusCode: 429 });
    await expect(
      sendNeutralPush(subscription, "weekly_recap"),
    ).resolves.toMatchObject({
      outcome: "transient_failure",
      category: "rate_limited",
      retryAfterSeconds: 900,
    });
  });

  it("fails closed on malformed VAPID secrets", () => {
    vi.stubEnv("WEB_PUSH_VAPID_PRIVATE_KEY", "too-short");
    expect(() => pushVapidPublicKey()).toThrow(
      "Web Push configuration unavailable.",
    );
  });
});
