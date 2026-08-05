import { afterEach, describe, expect, it } from "vitest";
import { chapterHref, bookHref, FLAT_READER_PATH } from "@/lib/bible/links";
import { loadChapterClient } from "@/lib/bible/client";
import { loadChapter } from "@/lib/bible/server";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";

function withPlatform(value: string | undefined, run: () => void) {
  const previous = process.env[PLATFORM];
  if (value === undefined) delete process.env[PLATFORM];
  else process.env[PLATFORM] = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env[PLATFORM];
    else process.env[PLATFORM] = previous;
  }
}

afterEach(() => {
  delete process.env[PLATFORM];
});

describe("chapterHref on web", () => {
  // These exact strings are what the rest of the app, the service worker
  // allowlist and the analytics normalizer already expect. Web must not move.
  it("keeps the readable nested route", () => {
    expect(chapterHref("john", 3)).toBe("/app/bible/john/3");
  });

  it("orders translation before verse, then the anchor", () => {
    expect(
      chapterHref("john", 3, { translation: "web", verse: 16, anchor: 16 }),
    ).toBe("/app/bible/john/3?translation=web&verse=16#verse-16");
  });

  it("passes a verse range through unescaped", () => {
    expect(chapterHref("mark", 4, { verse: "3-20", anchor: 3 })).toBe(
      "/app/bible/mark/4?verse=3-20#verse-3",
    );
  });

  it("omits empty options entirely", () => {
    expect(chapterHref("psalms", 23, { verse: "" })).toBe("/app/bible/psalms/23");
  });

  it("escapes a translation key", () => {
    expect(chapterHref("john", 1, { translation: "a b&c" })).toBe(
      "/app/bible/john/1?translation=a%20b%26c",
    );
  });

  it("leaves the book route alone on both targets", () => {
    expect(bookHref("john")).toBe("/app/bible/john");
    withPlatform("native", () => expect(bookHref("john")).toBe("/app/bible/john"));
  });
});

describe("chapterHref on native", () => {
  it("uses the single flat reader route", () => {
    withPlatform("native", () => {
      expect(chapterHref("john", 3)).toBe("/app/bible/read?book=john&chapter=3");
    });
  });

  it("carries translation, verse and anchor through the query", () => {
    withPlatform("native", () => {
      expect(
        chapterHref("mark", 4, { translation: "web", verse: "3-20", anchor: 3 }),
      ).toBe(
        "/app/bible/read?book=mark&chapter=4&translation=web&verse=3-20#verse-3",
      );
    });
  });

  it("stays in sync with the analytics normalizer's copy of the path", () => {
    // lib/analytics/events.ts is deliberately import-free and hardcodes this
    // path. If the route ever moves, this is what catches the drift.
    expect(FLAT_READER_PATH.replace(/\/+$/, "")).toBe("/app/bible/read");
  });

  it("emits no trailing slash — the native export does not set trailingSlash", () => {
    // trailingSlash:true would make usePathname() return "/app/quests/", which
    // breaks BottomNav tab highlighting, AppShell chrome, and the onboarding
    // launch gate, all of which compare pathname exactly.
    expect(FLAT_READER_PATH.endsWith("/")).toBe(false);
  });

  it("falls back to the web shape for any other target value", () => {
    withPlatform("web", () => expect(chapterHref("john", 3)).toBe("/app/bible/john/3"));
    withPlatform(undefined, () => expect(chapterHref("john", 3)).toBe("/app/bible/john/3"));
  });
});

describe("loadChapterClient mirrors the server loader", () => {
  // The two loaders feed the same `content` prop. If they ever disagree, the
  // iOS bundle would persist different reading position and bookmark text than
  // the web app for the same chapter.
  const cases: Array<[string, number]> = [
    ["genesis", 1],
    ["john", 3],
    ["psalms", 119],
    ["revelation", 22],
    ["3-john", 1],
    ["obadiah", 1],
  ];

  for (const [book, chapter] of cases) {
    it(`agrees on ${book} ${chapter}`, async () => {
      const [fromClient, fromServer] = await Promise.all([
        loadChapterClient(book, chapter),
        loadChapter(book, chapter),
      ]);
      expect(fromServer).not.toBeNull();
      expect(fromClient).toEqual(fromServer);
      expect(fromClient!.verses.length).toBeGreaterThan(0);
    });
  }

  const rejects: Array<[string, number, string]> = [
    ["nope", 1, "unknown book"],
    ["john", 0, "chapter below one"],
    ["john", 22, "chapter past the end"],
    ["john", 1.5, "non-integer chapter"],
    ["john", Number.NaN, "NaN chapter"],
  ];

  for (const [book, chapter, why] of rejects) {
    it(`rejects ${why} the same way`, async () => {
      expect(await loadChapterClient(book, chapter)).toBeNull();
      expect(await loadChapter(book, chapter)).toBeNull();
    });
  }

  it("echoes the caller's book slug, as the server loader does", async () => {
    const content = await loadChapterClient("john", 1);
    expect(content?.bookSlug).toBe("john");
    expect(content?.bookName).toBe("John");
    expect(content?.chapterCount).toBe(21);
  });

  it("serves repeat reads of one book from cache", async () => {
    const first = await loadChapterClient("romans", 8);
    const second = await loadChapterClient("romans", 12);
    expect(first?.verses.length).toBeGreaterThan(0);
    expect(second?.verses.length).toBeGreaterThan(0);
    expect(second?.chapter).toBe(12);
  });
});
