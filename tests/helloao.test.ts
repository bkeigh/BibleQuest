import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { API_BIBLE_MAX_RESPONSE_BYTES } from "@/lib/bible/api-bible";
import {
  HELLOAO_MAX_RESPONSE_BYTES,
  HelloAoError,
  fetchHelloAoChapter,
  fetchHelloAoPassage,
  parseHelloAoChapter,
  resolveHelloAoTranslation,
} from "@/lib/bible/helloao";
import {
  fetchBibleProviderPassage,
  serializeBibleProviderChapter,
} from "@/lib/bible/provider-dispatcher";
import { resolveSharedVerse } from "@/app/(marketing)/verse/[book]/[chapter]/[verse]/page";

function chapterPayload({
  translationId = "BSB",
  bookId = "GEN",
  chapterNumber = 1,
}: {
  translationId?: string;
  bookId?: string;
  chapterNumber?: number;
} = {}) {
  return {
    translation: {
      id: translationId,
      sha256:
        "6cc5238e442b4204b0f617cc5c932bc04f3bae4a0658e6393b0e319653ebe37f",
      name: "Berean Standard Bible",
      website: "https://berean.bible/",
      licenseUrl: "https://berean.bible/",
      licenseNotes: "Formatting adapted to JSON; wording unchanged.",
      language: "eng",
      textDirection: "ltr",
      availableFormats: ["json"],
      numberOfBooks: 66,
      totalNumberOfChapters: 1189,
      totalNumberOfVerses: 31086,
    },
    book: { id: bookId, translationId },
    chapter: {
      number: chapterNumber,
      content: [
        { type: "heading", content: ["The Creation"] },
        {
          type: "hebrew_subtitle",
          content: ["A manuscript subtitle", { noteId: 0 }],
        },
        {
          type: "verse",
          number: 1,
          content: [
            "In the beginning",
            { heading: "An inline heading" },
            { lineBreak: true },
            { text: "God created", poem: 1 },
            "the heavens and the earth.",
            { noteId: 0 },
          ],
        },
        {
          type: "verse",
          number: 2,
          content: ["The earth was formless and void."],
        },
      ],
      footnotes: [
        {
          noteId: 0,
          caller: "+",
          text: "A provider footnote that must not enter the verse wording.",
          reference: { chapter: chapterNumber, verse: 1 },
        },
      ],
    },
  };
}

function jsonResponse(payload: unknown = chapterPayload()): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function apiBibleCatalogPayload() {
  return {
    data: [
      {
        id: "0123456789abcdef-01",
        name: "New International Version",
        abbreviation: "NIV",
        language: {
          id: "eng",
          name: "English",
          nameLocal: "English",
          scriptDirection: "LTR",
        },
      },
    ],
  };
}

function apiBibleContentPayload(fumsToken?: string) {
  return {
    data: {
      copyright: "Licensed provider fixture.",
      content: [
        {
          name: "para",
          type: "tag",
          items: [
            {
              name: "verse",
              type: "tag",
              attrs: { number: "1", sid: "GEN 1:1" },
            },
            {
              type: "text",
              text: " Licensed Scripture fixture. ",
              attrs: { verseId: "GEN.1.1" },
            },
          ],
        },
      ],
    },
    meta: fumsToken ? { fumsToken } : {},
  };
}

describe("HelloAO open Scripture provider", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("parses documented verse, heading, line-break, formatted-text, and footnote shapes", () => {
    const verses = parseHelloAoChapter(chapterPayload().chapter);

    expect([...verses.entries()]).toEqual([
      [1, "In the beginning God created the heavens and the earth."],
      [2, "The earth was formless and void."],
    ]);
    expect(verses.get(1)).not.toContain("inline heading");
    expect(verses.get(1)).not.toContain("provider footnote");
  });

  it("does not insert Latin spacing around Chinese footnote boundaries", () => {
    const verses = parseHelloAoChapter({
      number: 3,
      content: [
        {
          type: "verse",
          number: 15,
          content: ["叫一切信他的", { noteId: 0 }, "都得永生", { noteId: 0 }, "。"],
        },
      ],
      footnotes: [{ noteId: 0, caller: "+", text: "异文" }],
    });

    expect(verses.get(15)).toBe("叫一切信他的都得永生。");
  });

  it("resolves only exact keys from the reviewed static allowlist", () => {
    expect(resolveHelloAoTranslation("bsb")).toMatchObject({
      key: "bsb",
      providerId: "BSB",
      source: "helloao",
      availability: "open",
    });
    expect(() => resolveHelloAoTranslation("BSB")).toThrow(HelloAoError);
    expect(() => resolveHelloAoTranslation("helloao:unknown")).toThrow(
      HelloAoError,
    );
  });

  it("fetches the exact allowlisted static chapter with a timeout and revalidation cache", async () => {
    fetchMock.mockResolvedValue(jsonResponse());

    const result = await fetchHelloAoChapter("bsb", "GEN", 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://bible.helloao.org/api/BSB/GEN/1.json");
    expect(init).toMatchObject({
      cache: "force-cache",
      redirect: "error",
      headers: { accept: "application/json" },
      next: { revalidate: 86_400 },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(result.translation).toMatchObject({
      key: "bsb",
      providerId: "BSB",
    });
    expect(result.translation.copyright).toContain(
      "Served by the HelloAO Free Use Bible API.",
    );
    expect(result.translation.copyright).not.toContain(
      "Formatting adapted to JSON",
    );
    expect(result.verses.get(2)).toBe("The earth was formless and void.");
  });

  it("rejects mismatched provider metadata and oversized bodies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(chapterPayload({ translationId: "eng_kjv" })),
    );
    await expect(fetchHelloAoChapter("bsb", "GEN", 1)).rejects.toMatchObject({
      code: "content_unavailable",
    });

    fetchMock.mockResolvedValueOnce(
      new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-length": String(HELLOAO_MAX_RESPONSE_BYTES + 1),
        },
      }),
    );
    await expect(fetchHelloAoChapter("bsb", "GEN", 1)).rejects.toMatchObject({
      code: "content_unavailable",
    });
  });

  it("fails closed when the upstream translation hash no longer matches the reviewed edition", async () => {
    const payload = chapterPayload();
    payload.translation.sha256 = "0".repeat(64);
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(fetchHelloAoChapter("bsb", "GEN", 1)).rejects.toMatchObject({
      code: "content_unavailable",
      message: "HelloAO returned mismatched chapter metadata.",
    });
  });

  it("rejects a successful HTML response before attempting to parse it", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>not a chapter</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(fetchHelloAoChapter("bsb", "GEN", 1)).rejects.toMatchObject({
      code: "content_unavailable",
      message: "HelloAO returned a non-JSON response.",
    });
  });

  it("rejects redirect responses at the fixed provider boundary", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://example.invalid/untrusted",
          "content-type": "application/json",
        },
      }),
    );

    await expect(fetchHelloAoChapter("bsb", "GEN", 1)).rejects.toMatchObject({
      code: "content_unavailable",
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });

  it("aborts a slow provider response after five seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const request = fetchHelloAoChapter("bsb", "GEN", 1);
    const rejection = expect(request).rejects.toMatchObject({
      code: "content_unavailable",
      message: "HelloAO timed out.",
    });
    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
  });

  it("assembles a bounded passage from the cached chapter document", async () => {
    fetchMock.mockResolvedValue(jsonResponse());

    const passage = await fetchHelloAoPassage("bsb", "GEN", 1, 1, 2);

    expect(passage.text).toBe(
      "In the beginning God created the heavens and the earth. The earth was formless and void.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves legitimately repeated consecutive verse wording", async () => {
    const payload = chapterPayload();
    payload.chapter.content = [
      { type: "verse", number: 1, content: ["A repeated refrain."] },
      { type: "verse", number: 2, content: ["A repeated refrain."] },
    ];
    payload.chapter.footnotes = [];
    fetchMock.mockResolvedValue(jsonResponse(payload));

    const passage = await fetchHelloAoPassage("bsb", "GEN", 1, 1, 2);

    expect(passage.text).toBe(
      "A repeated refrain. A repeated refrain.",
    );
  });

  it("fails closed instead of returning a reference with a missing verse", async () => {
    const payload = chapterPayload();
    payload.chapter.content = [
      { type: "verse", number: 1, content: ["Verse one is present."] },
    ];
    payload.chapter.footnotes = [];
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(
      fetchHelloAoPassage("bsb", "GEN", 1, 1, 2),
    ).rejects.toMatchObject({
      code: "content_unavailable",
      message: "HelloAO did not return requested verse 1:2.",
    });
  });

  it("falls back to BSB when API.Bible returns a successful non-JSON response", async () => {
    vi.stubEnv("API_BIBLE_API_KEY", "provider-key");
    vi.stubEnv(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
      "0123456789abcdef-01",
    );
    fetchMock
      .mockResolvedValueOnce(
        new Response("<html>not provider JSON</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse());

    const passage = await fetchBibleProviderPassage(
      "niv",
      "GEN",
      1,
      1,
      1,
    );

    expect(passage).toMatchObject({
      requestedKey: "niv",
      fallbackReason: "content_unavailable",
      translation: { key: "bsb" },
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      cache: "force-cache",
      redirect: "error",
      headers: { accept: "application/json", "api-key": "provider-key" },
    });
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("bounds API.Bible response bodies before using the open fallback", async () => {
    vi.stubEnv("API_BIBLE_API_KEY", "provider-key");
    vi.stubEnv(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
      "0123456789abcdef-01",
    );
    fetchMock
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(API_BIBLE_MAX_RESPONSE_BYTES + 1),
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse());

    const passage = await fetchBibleProviderPassage(
      "niv",
      "GEN",
      1,
      1,
      1,
    );

    expect(passage).toMatchObject({
      requestedKey: "niv",
      fallbackReason: "content_unavailable",
      translation: { key: "bsb" },
    });
  });

  it("falls back when API.Bible returns malformed JSON shapes", async () => {
    vi.stubEnv("API_BIBLE_API_KEY", "provider-key");
    vi.stubEnv(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
      "0123456789abcdef-01",
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse());

    await expect(
      fetchBibleProviderPassage("niv", "GEN", 1, 1, 1),
    ).resolves.toMatchObject({
      requestedKey: "niv",
      fallbackReason: "content_unavailable",
      translation: { key: "bsb" },
    });
  });

  it("requires a valid FUMS token before displaying licensed Scripture", async () => {
    vi.stubEnv("API_BIBLE_API_KEY", "provider-key");
    vi.stubEnv(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
      "0123456789abcdef-01",
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(apiBibleCatalogPayload()))
      .mockResolvedValueOnce(jsonResponse(apiBibleContentPayload()))
      .mockResolvedValueOnce(jsonResponse());

    await expect(
      fetchBibleProviderPassage("niv", "GEN", 1, 1, 1),
    ).resolves.toMatchObject({
      requestedKey: "niv",
      fallbackReason: "content_unavailable",
      translation: { key: "bsb" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns validated licensed Scripture with its required FUMS token", async () => {
    const token = "A_valid-provider-token_1234567890";
    vi.stubEnv("API_BIBLE_API_KEY", "provider-key");
    vi.stubEnv(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
      "0123456789abcdef-01",
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(apiBibleCatalogPayload()))
      .mockResolvedValueOnce(jsonResponse(apiBibleContentPayload(token)));

    await expect(
      fetchBibleProviderPassage("niv", "GEN", 1, 1, 1),
    ).resolves.toMatchObject({
      requestedKey: "niv",
      text: "Licensed Scripture fixture.",
      fumsToken: token,
      translation: {
        key: "niv",
        source: "api_bible",
        contentUsePolicy: "licensed_transient",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out a stalled API.Bible request before using BSB", async () => {
    vi.useFakeTimers();
    vi.stubEnv("API_BIBLE_API_KEY", "provider-key");
    vi.stubEnv(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
      "0123456789abcdef-01",
    );
    fetchMock.mockImplementation((url, init) => {
      if (String(url).startsWith("https://rest.api.bible/")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return Promise.resolve(jsonResponse());
    });

    const request = fetchBibleProviderPassage("niv", "GEN", 1, 1, 1);
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(request).resolves.toMatchObject({
      requestedKey: "niv",
      fallbackReason: "content_unavailable",
      translation: { key: "bsb" },
    });
  });

  it("falls back from an unavailable API.Bible preference to BSB with transparent metadata", async () => {
    vi.stubEnv("API_BIBLE_API_KEY", "");
    vi.stubEnv("API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS", "");
    fetchMock.mockResolvedValue(jsonResponse());

    const passage = await fetchBibleProviderPassage(
      "niv",
      "GEN",
      1,
      1,
      2,
    );

    expect(passage).toMatchObject({
      requestedKey: "niv",
      fallbackReason: "provider_not_configured",
      translation: { key: "bsb", providerId: "BSB" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records translation_unavailable when the licensed catalogue lacks the preferred edition", async () => {
    vi.stubEnv("API_BIBLE_API_KEY", "provider-key");
    vi.stubEnv(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
      "0123456789abcdef-01",
    );
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse());

    const passage = await fetchBibleProviderPassage(
      "niv",
      "GEN",
      1,
      1,
      1,
    );

    expect(passage).toMatchObject({
      requestedKey: "niv",
      fallbackReason: "translation_unavailable",
      translation: { key: "bsb" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses BSB when licensed content is temporarily unavailable", async () => {
    vi.stubEnv("API_BIBLE_API_KEY", "provider-key");
    vi.stubEnv(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
      "0123456789abcdef-01",
    );
    fetchMock
      .mockResolvedValueOnce(jsonResponse(apiBibleCatalogPayload()))
      .mockResolvedValueOnce(
        new Response("provider outage", { status: 503 }),
      )
      .mockResolvedValueOnce(jsonResponse());

    const passage = await fetchBibleProviderPassage(
      "niv",
      "GEN",
      1,
      1,
      1,
    );

    expect(passage).toMatchObject({
      requestedKey: "niv",
      fallbackReason: "content_unavailable",
      translation: { key: "bsb" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("preserves the original licensed-provider error when BSB also fails", async () => {
    vi.stubEnv("API_BIBLE_API_KEY", "");
    vi.stubEnv("API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS", "");
    fetchMock.mockResolvedValue(
      new Response("upstream unavailable", { status: 503 }),
    );

    await expect(
      fetchBibleProviderPassage("niv", "GEN", 1, 1, 1),
    ).rejects.toMatchObject({ code: "provider_not_configured" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not substitute a second remote edition for an explicitly selected open edition", async () => {
    fetchMock.mockResolvedValue(
      new Response("upstream unavailable", { status: 503 }),
    );

    await expect(
      fetchBibleProviderPassage("helloao:spa_r09", "GEN", 1, 1, 1),
    ).rejects.toMatchObject({ code: "content_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://bible.helloao.org/api/spa_r09/GEN/1.json",
    );
  });

  it("serializes provider-specific verse numbering without truncating to local WEB", () => {
    const providerVerses = new Map<number, string>([
      [1, "Verse one"],
      [25, "Verse twenty-five"],
      [26, "Provider-only verse twenty-six"],
      [27, "Provider-only verse twenty-seven"],
    ]);

    const serialized = serializeBibleProviderChapter(providerVerses);

    expect(serialized).toHaveLength(27);
    expect(serialized[25]).toBe("Provider-only verse twenty-six");
    expect(serialized[26]).toBe("Provider-only verse twenty-seven");
  });

  it("resolves provider-only verses on public share pages", async () => {
    const payload = chapterPayload({ bookId: "ROM", chapterNumber: 16 });
    payload.chapter.content = [
      {
        type: "verse",
        number: 26,
        content: [
          "to the only wise God be glory forever through Jesus Christ! Amen.",
        ],
      },
      {
        type: "verse",
        number: 27,
        content: ["A provider-specific final verse."],
      },
    ];
    payload.chapter.footnotes = [];
    fetchMock.mockResolvedValue(jsonResponse(payload));

    const shared = await resolveSharedVerse(
      "romans",
      "16",
      "26-27",
      "bsb",
    );

    expect(shared).toMatchObject({
      reference: "Romans 16:26–27",
      text:
        "to the only wise God be glory forever through Jesus Christ! Amen. A provider-specific final verse.",
      translation: { key: "bsb" },
    });
  });
});
