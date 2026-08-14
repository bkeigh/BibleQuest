"use client";

import type {
  PushReminderPreferences,
  SerializedPushSubscription,
} from "./validation";
import { authenticatedApiFetch } from "@/lib/platform/api";
import {
  notificationCapability,
  type NotificationPosture,
} from "@/lib/platform/notifications";

export interface PushConfig {
  available: true;
  publicKey: string;
  preferences: PushReminderPreferences;
  preferencesConfigured: boolean;
  subscriptionCount: number;
}

export type PushClientPosture = NotificationPosture;

export class PushClientError extends Error {
  constructor(readonly status = 0) {
    super("BibleQuest could not update reminders.");
    this.name = "PushClientError";
  }
}

/** Detects browser support and the iOS Home Screen requirement without prompts. */
export function pushClientPosture(): PushClientPosture {
  return notificationCapability().posture();
}

/** Reads the selected platform permission without prompting. */
export function currentNotificationPermission(): NotificationPermission {
  return notificationCapability().permission();
}

/** Converts a VAPID base64url public key to the PushManager byte shape. */
export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const decoded = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

async function responseReady(response: Response): Promise<Response> {
  if (!response.ok) throw new PushClientError(response.status);
  return response;
}

/** Reads browser-safe configuration without requesting notification permission. */
export async function fetchPushConfig(
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<PushConfig> {
  const response = await responseReady(
    await authenticatedApiFetch(expectedUserId, "/api/push/config", {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    }),
  );
  return (await response.json()) as PushConfig;
}

function serializedSubscription(
  subscription: PushSubscription,
): SerializedPushSubscription {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) {
    throw new PushClientError();
  }
  return {
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: {
      p256dh: value.keys.p256dh,
      auth: value.keys.auth,
    },
  };
}

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js");
  let timer: number | null = null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(new PushClientError()),
          15_000,
        );
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

/** Reads the current browser endpoint without any server or permission write. */
export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushClientPosture().supported) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.pushManager.getSubscription() ?? null;
}

async function deleteEndpoint(
  expectedUserId: string,
  endpoint: string,
): Promise<void> {
  await responseReady(
    await authenticatedApiFetch(expectedUserId, "/api/push/subscriptions", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }),
  );
}

/** Prompts only from the caller's click, then persists one encrypted endpoint. */
export async function enablePushReminders(
  expectedUserId: string,
  config: PushConfig,
  preferences: PushReminderPreferences,
): Promise<PushSubscription> {
  if (!pushClientPosture().supported) throw new PushClientError();
  const permission = await notificationCapability().requestPermission();
  if (permission !== "granted") throw new PushClientError(403);

  const registration = await serviceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  const created = !subscription;
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(config.publicKey),
  });
  const serialized = serializedSubscription(subscription);
  try {
    await responseReady(
      await authenticatedApiFetch(
        expectedUserId,
        "/api/push/subscriptions",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: serialized,
            preferences,
          }),
        },
      ),
    );
    return subscription;
  } catch (error) {
    if (created) {
      await deleteEndpoint(expectedUserId, serialized.endpoint).catch(
        () => undefined,
      );
      await subscription.unsubscribe().catch(() => undefined);
    }
    throw error;
  }
}

/** Saves account-wide choices without changing browser permission. */
export async function savePushPreferences(
  expectedUserId: string,
  preferences: PushReminderPreferences,
): Promise<void> {
  await responseReady(
    await authenticatedApiFetch(expectedUserId, "/api/push/preferences", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    }),
  );
}

/** Disables account delivery first, then removes this browser endpoint. */
export async function disablePushReminders(
  expectedUserId: string,
  subscription: PushSubscription | null,
  preferences: PushReminderPreferences,
): Promise<void> {
  await savePushPreferences(expectedUserId, preferences);
  if (!subscription) return;
  await deleteEndpoint(expectedUserId, subscription.endpoint);
  await subscription.unsubscribe();
}

/** Requests one server-throttled neutral test notification. */
export async function sendTestPush(
  expectedUserId: string,
  subscription: PushSubscription,
): Promise<void> {
  await responseReady(
    await authenticatedApiFetch(expectedUserId, "/api/push/test", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }),
  );
}
