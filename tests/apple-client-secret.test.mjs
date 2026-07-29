import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateAppleClientSecret } from "../scripts/generate-apple-client-secret.mjs";

const TEAM_ID = "A1B2C3D4E5";
const KEY_ID = "F6G7H8J9K0";
const CLIENT_ID = "co.biblequest.web";
const ISSUED_AT = 1_750_000_000;

/** Builds an isolated ES256 key pair with the same PKCS#8 shape as an Apple key. */
function createTestKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }),
    publicKey,
  };
}

/** Decodes one JWT segment without accepting padded or non-URL-safe input. */
function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("Apple client-secret generator", () => {
  it("creates a verifiable ES256 JWT with Apple's required claims", () => {
    const { privateKey, publicKey } = createTestKeyPair();
    const token = generateAppleClientSecret({
      teamId: TEAM_ID,
      keyId: KEY_ID,
      clientId: CLIENT_ID,
      privateKey,
      validDays: 180,
      issuedAt: ISSUED_AT,
    });
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

    expect(decodeSegment(encodedHeader)).toEqual({
      alg: "ES256",
      kid: KEY_ID,
    });
    expect(decodeSegment(encodedPayload)).toEqual({
      iss: TEAM_ID,
      iat: ISSUED_AT,
      exp: ISSUED_AT + 180 * 24 * 60 * 60,
      aud: "https://appleid.apple.com",
      sub: CLIENT_ID,
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(encodedSignature, "base64url"),
      ),
    ).toBe(true);
  });

  it("rejects malformed identifiers and validity beyond Apple's limit", () => {
    const { privateKey } = createTestKeyPair();
    const configuration = {
      teamId: TEAM_ID,
      keyId: KEY_ID,
      clientId: CLIENT_ID,
      privateKey,
      issuedAt: ISSUED_AT,
    };

    expect(() =>
      generateAppleClientSecret({ ...configuration, teamId: "too-short" }),
    ).toThrow("Team ID");
    expect(() =>
      generateAppleClientSecret({ ...configuration, validDays: 181 }),
    ).toThrow("between 1 and 180 days");
  });
});
