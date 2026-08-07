import { afterEach, describe, expect, it } from "vitest";
import {
  NATIVE_APP_ORIGIN,
  isNativeAppOrigin,
  nativeApiOriginEnabled,
} from "@/lib/http/native-origin";
import { hasSameOrigin } from "@/lib/http/request";

const LATCH = "BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED";

function req(origin: string | null, url = "https://www.biblequest.co/api/x") {
  const headers = new Headers({ host: "www.biblequest.co" });
  if (origin !== null) headers.set("origin", origin);
  return new Request(url, { headers });
}

afterEach(() => {
  delete process.env[LATCH];
});

describe("the native API origin latch", () => {
  it("is off unless the value is exactly \"true\"", () => {
    for (const value of [undefined, "", "false", "TRUE", "True", "1", " true", "true "]) {
      expect(nativeApiOriginEnabled(value)).toBe(false);
    }
    expect(nativeApiOriginEnabled("true")).toBe(true);
  });

  it("keeps the native origin rejected while it is off", () => {
    expect(isNativeAppOrigin(req(NATIVE_APP_ORIGIN))).toBe(false);
  });
});

describe("native origin matching", () => {
  afterEach(() => {
    delete process.env[LATCH];
  });

  it("accepts the exact measured origin when enabled", () => {
    process.env[LATCH] = "true";
    expect(isNativeAppOrigin(req(NATIVE_APP_ORIGIN))).toBe(true);
  });

  it("accepts a case variant of the header", () => {
    process.env[LATCH] = "true";
    expect(isNativeAppOrigin(req("CAPACITOR://LOCALHOST"))).toBe(true);
  });

  it("rejects every other custom scheme", () => {
    process.env[LATCH] = "true";
    // These all serialise to the string "null" through URL.origin, which is
    // exactly why the comparison must be on the raw header.
    for (const origin of [
      "foo://bar",
      "chrome-extension://abcdefghijklmnop",
      "capacitor://evil",
      "capacitor://localhost.evil.test",
      "ionic://localhost",
      "file://",
    ]) {
      expect(isNativeAppOrigin(req(origin))).toBe(false);
    }
  });

  it("rejects the literal string \"null\"", () => {
    process.env[LATCH] = "true";
    // A sandboxed iframe or a cross-origin redirect can make a real browser
    // send `Origin: null`. Allowlisting it would open the API to the open web.
    expect(isNativeAppOrigin(req("null"))).toBe(false);
  });

  it("rejects a missing origin", () => {
    process.env[LATCH] = "true";
    expect(isNativeAppOrigin(req(null))).toBe(false);
  });
});

describe("routes that must stay closed to the native origin", () => {
  it("support checkout rejects the native origin explicitly", async () => {
    // The only route where the origin check is the sole protection: it allows
    // guests, so the native allowance would hand unauthenticated Stripe
    // Checkout creation to any client that sets an Origin header.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/app/api/support/checkout/route.ts",
      "utf8",
    );
    expect(source).toContain(
      'if (isNativeAppOrigin(request)) return privateError("forbidden", 403);',
    );
  });
});

describe("hasSameOrigin with the native allowance", () => {
  afterEach(() => {
    delete process.env[LATCH];
  });

  it("still rejects the native origin while the latch is off", () => {
    expect(hasSameOrigin(req(NATIVE_APP_ORIGIN))).toBe(false);
  });

  it("accepts the native origin once enabled", () => {
    process.env[LATCH] = "true";
    expect(hasSameOrigin(req(NATIVE_APP_ORIGIN))).toBe(true);
  });

  it("leaves every existing web decision unchanged", () => {
    process.env[LATCH] = "true";
    // Same-origin still passes.
    expect(hasSameOrigin(req("https://www.biblequest.co"))).toBe(true);
    // And the cases the guard already rejected stay rejected.
    expect(hasSameOrigin(req(null))).toBe(false);
    expect(hasSameOrigin(req("https://evil.test"))).toBe(false);
    expect(hasSameOrigin(req("http://www.biblequest.co"))).toBe(false);
    expect(hasSameOrigin(req("https://user:pw@www.biblequest.co"))).toBe(false);
    expect(hasSameOrigin(req("null"))).toBe(false);
    expect(hasSameOrigin(req("foo://bar"))).toBe(false);
  });
});
