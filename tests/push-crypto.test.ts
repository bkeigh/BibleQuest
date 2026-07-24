import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  assertPushEncryptionReady,
  decryptPushSubscription,
  encryptPushSubscription,
  pushEndpointFingerprint,
} from "@/lib/push/crypto.server";

const subscription = {
  endpoint: "https://push.example.test/send/opaque-token",
  expirationTime: null,
  keys: {
    p256dh: "A".repeat(87),
    auth: "B".repeat(22),
  },
};

describe("encrypted push subscriptions", () => {
  beforeEach(() => {
    vi.stubEnv(
      "PUSH_SUBSCRIPTION_ENCRYPTION_KEY",
      randomBytes(32).toString("base64"),
    );
    vi.stubEnv("PUSH_SUBSCRIPTION_KEY_VERSION", "7");
  });

  it("round-trips an authenticated envelope without storing plaintext", () => {
    const encrypted = encryptPushSubscription(subscription);

    expect(encrypted.encryptionKeyVersion).toBe(7);
    expect(encrypted.endpointFingerprint).toBe(
      pushEndpointFingerprint(subscription.endpoint),
    );
    expect(encrypted.encryptedSubscription).not.toContain(
      "push.example.test",
    );
    expect(
      decryptPushSubscription(
        encrypted.encryptedSubscription,
        encrypted.encryptionKeyVersion,
        encrypted.endpointFingerprint,
      ),
    ).toEqual(subscription);
  });

  it("rejects ciphertext, fingerprint, and key-version tampering", () => {
    const encrypted = encryptPushSubscription(subscription);
    const envelope = encrypted.encryptedSubscription.split(".");
    envelope[3] =
      (envelope[3].startsWith("A") ? "B" : "A") + envelope[3].slice(1);
    const changedCiphertext = envelope.join(".");

    expect(() =>
      decryptPushSubscription(
        changedCiphertext,
        encrypted.encryptionKeyVersion,
        encrypted.endpointFingerprint,
      ),
    ).toThrow("Push subscription unavailable.");
    expect(() =>
      decryptPushSubscription(
        encrypted.encryptedSubscription,
        encrypted.encryptionKeyVersion,
        "c".repeat(64),
      ),
    ).toThrow("Push subscription unavailable.");
    expect(() =>
      decryptPushSubscription(
        encrypted.encryptedSubscription,
        8,
        encrypted.endpointFingerprint,
      ),
    ).toThrow("Push subscription unavailable.");
  });

  it("supports explicit old-key retention during rotation", () => {
    const oldKey = process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY!;
    const encrypted = encryptPushSubscription(subscription);
    vi.stubEnv(
      "PUSH_SUBSCRIPTION_ENCRYPTION_KEY",
      randomBytes(32).toString("base64"),
    );
    vi.stubEnv("PUSH_SUBSCRIPTION_KEY_VERSION", "8");
    vi.stubEnv(
      "PUSH_SUBSCRIPTION_ENCRYPTION_KEYS",
      JSON.stringify({
        7: oldKey,
        8: process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY,
      }),
    );

    expect(assertPushEncryptionReady()).toBe(8);
    expect(
      decryptPushSubscription(
        encrypted.encryptedSubscription,
        7,
        encrypted.endpointFingerprint,
      ),
    ).toEqual(subscription);
  });

  it("fails closed on malformed or missing 256-bit keys", () => {
    vi.stubEnv("PUSH_SUBSCRIPTION_ENCRYPTION_KEY", "short");
    expect(() => assertPushEncryptionReady()).toThrow(
      "Push encryption configuration unavailable.",
    );
  });
});
