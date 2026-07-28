import { describe, expect, it } from "vitest";
import {
  boundedBytes,
  boundedJson,
  boundedText,
} from "@/lib/http/json";
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

  it("caps the bytes actually read even when Content-Length understates them", async () => {
    const request = new Request("https://biblequest.test/api/private", {
      method: "POST",
      headers: { "Content-Length": "2" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.enqueue(new Uint8Array([4, 5, 6]));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const result = await boundedBytes(request, 4);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });

  it("strictly decodes capped UTF-8 and requires exact JSON content type", async () => {
    const invalidUtf8 = await boundedText(
      new Request("https://biblequest.test/api/private", {
        method: "POST",
        body: new Uint8Array([0xc3, 0x28]),
      }),
      8,
    );
    expect(invalidUtf8).toBeInstanceOf(Response);
    expect((invalidUtf8 as Response).status).toBe(400);

    const wrongType = await boundedJson(
      new Request("https://biblequest.test/api/private", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
      8,
    );
    expect(wrongType).toBeInstanceOf(Response);
    expect((wrongType as Response).status).toBe(400);
  });
});
