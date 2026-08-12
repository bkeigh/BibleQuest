import { afterEach, describe, expect, it } from "vitest";
import {
  applyNativeCorsHeaders,
  corsEligibleApiPath,
  nativeCorsPreflightResponse,
} from "@/lib/http/native-cors";
import { NATIVE_APP_ORIGIN } from "@/lib/http/native-origin";
import {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_US_RELEASE_HEADER,
} from "@/lib/sync/native-beta-headers";

const LATCH = "BIBLEQUEST_NATIVE_API_ORIGIN_ENABLED";

function req(
  origin: string | null,
  {
    method = "GET",
    url = "https://www.biblequest.co/api/arcade/status",
  }: { method?: string; url?: string } = {},
) {
  const headers = new Headers({ host: "www.biblequest.co" });
  if (origin !== null) headers.set("origin", origin);
  return new Request(url, { headers, method });
}

function preflight(origin: string | null, url?: string) {
  return nativeCorsPreflightResponse(
    req(origin, { method: "OPTIONS", ...(url ? { url } : {}) }),
  );
}

afterEach(() => {
  delete process.env[LATCH];
});

describe("latch-off responses stay byte-identical", () => {
  it("answers no preflight even for the exact native origin", () => {
    expect(preflight(NATIVE_APP_ORIGIN)).toBeNull();
  });

  it("decorates no response even for the exact native origin", () => {
    const response = new Response(null);
    applyNativeCorsHeaders(req(NATIVE_APP_ORIGIN), response);
    expect([...response.headers.keys()]).toEqual([]);
  });
});

describe("the preflight short-circuit", () => {
  it("returns 204 with the full static header set", () => {
    process.env[LATCH] = "true";
    const response = preflight(NATIVE_APP_ORIGIN);
    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe(
      NATIVE_APP_ORIGIN,
    );
    expect(response?.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, PATCH, DELETE",
    );
    expect(response?.headers.get("access-control-allow-headers")).toBe(
      [
        "Authorization",
        "Content-Type",
        EXPECTED_ACCOUNT_USER_HEADER,
        NATIVE_ACCOUNT_BETA_HEADER,
        NATIVE_ACCOUNT_US_RELEASE_HEADER,
        ACCOUNT_DELETION_CLEANUP_HEADER,
      ].join(", "),
    );
    expect(response?.headers.get("access-control-max-age")).toBe("600");
    expect(response?.headers.get("vary")).toBe("Origin");
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
  });

  it("never grants credentials — a permanent security pin", () => {
    // capacitor://localhost is the default origin of EVERY Capacitor iOS app,
    // not just BibleQuest's. Credentials here would extend a credentialed read
    // to any third-party WebView. Cookies are measurably never sent cross-site,
    // so this header must never appear, whatever future the allowlist has.
    process.env[LATCH] = "true";
    const response = preflight(NATIVE_APP_ORIGIN);
    expect(
      response?.headers.has("access-control-allow-credentials"),
    ).toBe(false);
  });

  it("ignores non-OPTIONS methods", () => {
    process.env[LATCH] = "true";
    expect(
      nativeCorsPreflightResponse(req(NATIVE_APP_ORIGIN, { method: "GET" })),
    ).toBeNull();
  });

  it("answers only the reviewed origin", () => {
    process.env[LATCH] = "true";
    for (const origin of [
      null,
      "null",
      "https://evil.test",
      "https://www.biblequest.co",
      "capacitor://evil",
      "capacitor://localhost.evil.test",
      "ionic://localhost",
    ]) {
      expect(preflight(origin)).toBeNull();
    }
  });

  it("emits the frozen constant, never the request's own header", () => {
    process.env[LATCH] = "true";
    const response = preflight("CAPACITOR://LOCALHOST");
    expect(response?.headers.get("access-control-allow-origin")).toBe(
      "capacitor://localhost",
    );
  });
});

describe("response decoration", () => {
  it("adds the origin, exposed headers, and Vary for the native origin", () => {
    process.env[LATCH] = "true";
    const response = new Response(null);
    applyNativeCorsHeaders(req(NATIVE_APP_ORIGIN), response);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      NATIVE_APP_ORIGIN,
    );
    expect(response.headers.get("access-control-expose-headers")).toBe(
      "X-BibleQuest-Avatar-Version, X-BibleQuest-Avatar-Updated-At",
    );
    expect(response.headers.get("vary")).toBe("Origin");
    expect(
      response.headers.has("access-control-allow-credentials"),
    ).toBe(false);
  });

  it("appends to an existing Vary without duplicating Origin", () => {
    process.env[LATCH] = "true";
    const response = new Response(null, { headers: { Vary: "Accept" } });
    applyNativeCorsHeaders(req(NATIVE_APP_ORIGIN), response);
    expect(response.headers.get("vary")).toBe("Accept, Origin");

    const alreadyVarying = new Response(null, {
      headers: { Vary: "Accept, origin" },
    });
    applyNativeCorsHeaders(req(NATIVE_APP_ORIGIN), alreadyVarying);
    expect(alreadyVarying.headers.get("vary")).toBe("Accept, origin");
  });

  it("leaves every other origin's response untouched", () => {
    process.env[LATCH] = "true";
    for (const origin of [null, "https://evil.test", "capacitor://evil"]) {
      const response = new Response(null);
      applyNativeCorsHeaders(req(origin), response);
      expect([...response.headers.keys()]).toEqual([]);
    }
  });
});

describe("path eligibility", () => {
  it("covers /api/* and excludes the shared-cacheable plans route", () => {
    expect(corsEligibleApiPath("/api/arcade/status")).toBe(true);
    expect(corsEligibleApiPath("/api/billing/status")).toBe(true);
    expect(corsEligibleApiPath("/api/profile/avatar")).toBe(true);
    expect(corsEligibleApiPath("/api/billing/plans")).toBe(false);
    expect(corsEligibleApiPath("/api/billing/plans/")).toBe(false);
    expect(corsEligibleApiPath("/api/billing/plans//")).toBe(false);
    expect(corsEligibleApiPath("/api/billing/plans///")).toBe(false);
    expect(corsEligibleApiPath("/api//billing/plans")).toBe(false);
    expect(corsEligibleApiPath("/api")).toBe(false);
    expect(corsEligibleApiPath("/app/journey")).toBe(false);
    expect(corsEligibleApiPath("/")).toBe(false);
  });

  it("keeps both helpers away from the plans route end to end", () => {
    process.env[LATCH] = "true";
    const url = "https://www.biblequest.co/api/billing/plans";
    expect(preflight(NATIVE_APP_ORIGIN, url)).toBeNull();
    const response = new Response(null);
    applyNativeCorsHeaders(req(NATIVE_APP_ORIGIN, { url }), response);
    expect([...response.headers.keys()]).toEqual([]);
  });

  it("stays fail-closed on encoded or case-varied plans lookalikes", () => {
    // Case variants are not API routes at all. The percent-encoded spelling IS
    // treated as an ordinary API path — measured on Next 16.2.12, the router
    // does not decode before matching, so /api/billing/%70lans reaches a 404
    // (private, no-store) and never the shared-cacheable plans payload. The
    // exclusion therefore cannot be bypassed by encoding; before enabling the
    // latch on a deployment, probe that its edge agrees (%70lans → 404).
    expect(corsEligibleApiPath("/API/billing/plans")).toBe(false);
    expect(corsEligibleApiPath("/api/billing/%70lans")).toBe(true);
  });
});
