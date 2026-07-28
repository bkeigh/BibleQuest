#!/usr/bin/env node

/**
 * Generates the ES256 client-secret JWT required by Apple OAuth. The private
 * key is read locally and never written, logged, or sent over the network.
 */
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_VALID_DAYS = 180;
const MAX_VALID_DAYS = 180;

/** Encodes JSON or bytes with the unpadded base64url form JWT requires. */
function base64Url(value) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(JSON.stringify(value), "utf8");
  return bytes.toString("base64url");
}

/** Rejects empty or malformed Apple configuration before signing anything. */
function validateConfiguration({
  teamId,
  keyId,
  clientId,
  privateKey,
  validDays,
}) {
  if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error("Team ID must be 10 uppercase letters or digits.");
  }
  if (!/^[A-Z0-9]{10}$/.test(keyId)) {
    throw new Error("Key ID must be 10 uppercase letters or digits.");
  }
  if (!/^[A-Za-z0-9.-]+$/.test(clientId)) {
    throw new Error("Client ID must be a reverse-domain Apple Services ID.");
  }
  if (!privateKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Private key must be an Apple .p8 PKCS#8 key.");
  }
  if (
    !Number.isInteger(validDays) ||
    validDays < 1 ||
    validDays > MAX_VALID_DAYS
  ) {
    throw new Error(`Validity must be between 1 and ${MAX_VALID_DAYS} days.`);
  }
}

/** Builds a client secret with Apple's required issuer, audience, and subject. */
export function generateAppleClientSecret({
  teamId,
  keyId,
  clientId,
  privateKey,
  validDays = DEFAULT_VALID_DAYS,
  issuedAt = Math.floor(Date.now() / 1000),
}) {
  validateConfiguration({
    teamId,
    keyId,
    clientId,
    privateKey,
    validDays,
  });

  const header = base64Url({ alg: "ES256", kid: keyId });
  const payload = base64Url({
    iss: teamId,
    iat: issuedAt,
    exp: issuedAt + validDays * 24 * 60 * 60,
    aud: "https://appleid.apple.com",
    sub: clientId,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64Url(signature)}`;
}

/** Parses a small explicit flag set so secrets never enter positional output. */
function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value) {
      throw new Error(`Missing value for ${flag ?? "argument"}.`);
    }
    values.set(flag, value);
  }
  return values;
}

/** Runs only when invoked directly, keeping the generator importable for tests. */
function main() {
  const values = parseArguments(process.argv.slice(2));
  const privateKeyPath = values.get("--private-key");
  if (!privateKeyPath) {
    throw new Error(
      "Usage: node scripts/generate-apple-client-secret.mjs " +
        "--team-id TEAMID --key-id KEYID --client-id SERVICEID " +
        "--private-key /absolute/path/AuthKey_KEYID.p8 [--days 180]",
    );
  }

  const validDays = Number(values.get("--days") ?? DEFAULT_VALID_DAYS);
  const token = generateAppleClientSecret({
    teamId: values.get("--team-id") ?? "",
    keyId: values.get("--key-id") ?? "",
    clientId: values.get("--client-id") ?? "",
    privateKey: readFileSync(privateKeyPath, "utf8"),
    validDays,
  });
  process.stdout.write(`${token}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Apple client secret generation failed: ${
        error instanceof Error ? error.message : "unknown error"
      }\n`,
    );
    process.exitCode = 1;
  }
}
