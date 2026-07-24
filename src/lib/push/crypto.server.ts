import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  parseSerializedPushSubscription,
  type SerializedPushSubscription,
} from "./validation";

interface EncryptedPushSubscription {
  endpointFingerprint: string;
  encryptedSubscription: string;
  encryptionKeyVersion: number;
}

function currentKeyVersion(): number {
  const version = Number(process.env.PUSH_SUBSCRIPTION_KEY_VERSION ?? "1");
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Push encryption configuration unavailable.");
  }
  return version;
}

function decodeKey(value: unknown): Buffer | null {
  if (typeof value !== "string") return null;
  try {
    const key = Buffer.from(value, "base64");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

/** Loads a versioned key ring so rotation never strands existing endpoints. */
function encryptionKeys(): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  const single = decodeKey(process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEY);
  if (single) keys.set(currentKeyVersion(), single);

  const encodedRing = process.env.PUSH_SUBSCRIPTION_ENCRYPTION_KEYS;
  if (encodedRing) {
    try {
      const ring = JSON.parse(encodedRing) as Record<string, unknown>;
      for (const [rawVersion, rawKey] of Object.entries(ring)) {
        const version = Number(rawVersion);
        const key = decodeKey(rawKey);
        if (Number.isSafeInteger(version) && version > 0 && key) {
          keys.set(version, key);
        }
      }
    } catch {
      throw new Error("Push encryption configuration unavailable.");
    }
  }
  if (!keys.has(currentKeyVersion())) {
    throw new Error("Push encryption configuration unavailable.");
  }
  return keys;
}

/** Fails closed unless the current encryption version has a 256-bit key. */
export function assertPushEncryptionReady(): number {
  const version = currentKeyVersion();
  encryptionKeys();
  return version;
}

/** Produces a non-reversible lookup for one provider endpoint. */
export function pushEndpointFingerprint(endpoint: string): string {
  return createHash("sha256").update(endpoint, "utf8").digest("hex");
}

function aad(fingerprint: string, version: number): Buffer {
  return Buffer.from(
    `biblequest:push-subscription:v1:${version}:${fingerprint}`,
    "utf8",
  );
}

/** Encrypts endpoint and browser keys together with authenticated AES-256-GCM. */
export function encryptPushSubscription(
  subscription: SerializedPushSubscription,
): EncryptedPushSubscription {
  const version = currentKeyVersion();
  const key = encryptionKeys().get(version)!;
  const fingerprint = pushEndpointFingerprint(subscription.endpoint);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(fingerprint, version));
  const plaintext = Buffer.from(JSON.stringify(subscription), "utf8");
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    endpointFingerprint: fingerprint,
    encryptedSubscription: [
      "v1",
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join("."),
    encryptionKeyVersion: version,
  };
}

/** Decrypts only authenticated, versioned subscription envelopes. */
export function decryptPushSubscription(
  encrypted: string,
  version: number,
  fingerprint: string,
): SerializedPushSubscription {
  const parts = encrypted.split(".");
  const key = encryptionKeys().get(version);
  if (
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    !key ||
    !/^[0-9a-f]{64}$/.test(fingerprint)
  ) {
    throw new Error("Push subscription unavailable.");
  }
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 16) {
      throw new Error("invalid envelope");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(fingerprint, version));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const subscription = parseSerializedPushSubscription(
      JSON.parse(plaintext.toString("utf8")),
    );
    if (!subscription) throw new Error("invalid subscription");
    return subscription;
  } catch {
    throw new Error("Push subscription unavailable.");
  }
}
