import "server-only";

import webPush from "web-push";
import type {
  PushReminderKind,
  SerializedPushSubscription,
} from "./validation";

export interface PushDeliveryOutcome {
  outcome: "sent" | "transient_failure" | "permanent_failure";
  statusCodeClass: 2 | 4 | 5 | null;
  category:
    | "ok"
    | "expired"
    | "rate_limited"
    | "provider"
    | "network"
    | "invalid";
  retryAfterSeconds: number;
  removeSubscription: boolean;
}

function validVapidKey(value: unknown, expectedBytes: number): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }
  return Math.floor((value.length * 3) / 4) === expectedBytes;
}

/** Validates and exposes only the browser-safe public VAPID configuration. */
export function pushVapidPublicKey(): string {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  let subjectReady = false;
  try {
    if (subject?.startsWith("mailto:")) {
      subjectReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject.slice(7));
    } else if (subject) {
      const url = new URL(subject);
      subjectReady =
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash;
    }
  } catch {
    subjectReady = false;
  }
  if (
    !subjectReady ||
    !validVapidKey(publicKey, 65) ||
    !validVapidKey(privateKey, 32)
  ) {
    throw new Error("Web Push configuration unavailable.");
  }
  webPush.setVapidDetails(subject!, publicKey, privateKey);
  return publicKey;
}

function statusClass(statusCode: number): 2 | 4 | 5 | null {
  const value = Math.floor(statusCode / 100);
  return value === 2 || value === 4 || value === 5 ? value : null;
}

/** Sends one fixed, content-free notification and classifies provider failure. */
export async function sendNeutralPush(
  subscription: SerializedPushSubscription,
  kind: PushReminderKind | "test",
): Promise<PushDeliveryOutcome> {
  pushVapidPublicKey();
  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: subscription.keys,
      },
      JSON.stringify({ version: 1, kind }),
      {
        TTL: 60 * 60,
        urgency: "normal",
      },
    );
    return {
      outcome: "sent",
      statusCodeClass: 2,
      category: "ok",
      retryAfterSeconds: 300,
      removeSubscription: false,
    };
  } catch (error) {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : null;
    if (statusCode === 404 || statusCode === 410) {
      return {
        outcome: "permanent_failure",
        statusCodeClass: 4,
        category: "expired",
        retryAfterSeconds: 300,
        removeSubscription: true,
      };
    }
    if (statusCode === 429) {
      return {
        outcome: "transient_failure",
        statusCodeClass: 4,
        category: "rate_limited",
        retryAfterSeconds: 900,
        removeSubscription: false,
      };
    }
    if (statusCode === 408 || (statusCode !== null && statusCode >= 500)) {
      return {
        outcome: "transient_failure",
        statusCodeClass: statusCode ? statusClass(statusCode) : null,
        category: "provider",
        retryAfterSeconds: 300,
        removeSubscription: false,
      };
    }
    if (statusCode !== null && statusCode >= 400) {
      return {
        outcome: "permanent_failure",
        statusCodeClass: statusClass(statusCode),
        category: "invalid",
        retryAfterSeconds: 300,
        removeSubscription: false,
      };
    }
    return {
      outcome: "transient_failure",
      statusCodeClass: null,
      category: "network",
      retryAfterSeconds: 300,
      removeSubscription: false,
    };
  }
}
