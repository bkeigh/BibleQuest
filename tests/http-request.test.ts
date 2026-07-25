import { describe, expect, it } from "vitest";
import { hasSameOrigin, privateError } from "@/lib/http/request";

/** Builds a proxied request whose internal URL differs from the browser host. */
function proxiedRequest(origin: string | null, host = "preview.biblequest.test") {
  const headers = new Headers({
    host,
    "x-forwarded-proto": "https",
  });
  if (origin) headers.set("origin", origin);
  return new Request("http://internal-proxy:3000/api/profile/avatar", {
    headers,
  });
}

describe("private mutation request guards", () => {
  it("accepts the exact browser-facing origin behind an internal proxy", () => {
    expect(
      hasSameOrigin(
        proxiedRequest("https://preview.biblequest.test"),
      ),
    ).toBe(true);
  });

  it("rejects missing, cross-site, credentialed, and lookalike origins", () => {
    expect(hasSameOrigin(proxiedRequest(null))).toBe(false);
    expect(hasSameOrigin(proxiedRequest("https://evil.test"))).toBe(false);
    expect(
      hasSameOrigin(
        proxiedRequest("https://preview.biblequest.test.evil.test"),
      ),
    ).toBe(false);
    expect(
      hasSameOrigin(
        proxiedRequest("https://user:pass@preview.biblequest.test"),
      ),
    ).toBe(false);
  });

  it("returns bounded non-cacheable errors", async () => {
    const response = privateError("unavailable", 503);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "unavailable" });
  });
});
