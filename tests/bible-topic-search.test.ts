import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { loadChapter } from "@/lib/bible/server";
import {
  SCRIPTURE_TOPICS,
  searchScriptureTopics,
  topicPassageHref,
} from "@/lib/bible/topics";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";

/** Runs a link assertion against one build target without leaking environment state. */
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

describe("reviewed Scripture topic search", () => {
  it("finds forgiveness by its title and natural language", () => {
    expect(searchScriptureTopics("forgiveness")[0]?.slug).toBe("forgiveness");
    expect(searchScriptureTopics("How can I forgive someone?")[0]?.slug).toBe(
      "forgiveness",
    );
  });

  it("recognizes useful synonyms without fuzzy or network-dependent search", () => {
    expect(searchScriptureTopics("I feel worried")[0]?.slug).toBe(
      "anxiety-and-peace",
    );
    expect(searchScriptureTopics("my spouse")[0]?.slug).toBe("marriage");
    expect(searchScriptureTopics("burnout")[0]?.slug).toBe("rest");
  });

  it("returns stable catalog order for equally relevant aliases", () => {
    expect(searchScriptureTopics("community").map((topic) => topic.slug)).toEqual([
      "relationships-and-conflict",
      "loneliness-and-belonging",
    ]);
  });

  it("returns no suggestions for blank or unrelated terms", () => {
    expect(searchScriptureTopics("   ")).toEqual([]);
    expect(searchScriptureTopics("zebulun")).toEqual([]);
  });

  it("ignores short and filler-only input instead of guessing a topic", () => {
    expect(searchScriptureTopics("a")).toEqual([]);
    expect(searchScriptureTopics("and")).toEqual([]);
    expect(searchScriptureTopics("how can I")).toEqual([]);
  });
});

describe("reviewed Scripture topic catalog", () => {
  it("keeps topic and book discovery as separate controls", () => {
    const bibleIndex = readFileSync(
      "src/components/bible/BibleIndex.tsx",
      "utf8",
    );

    expect(bibleIndex).toContain('id="bible-topic-search"');
    expect(bibleIndex).toContain('id="bible-book-search"');
    expect(bibleIndex).toContain("Find Scripture by topic");
    expect(bibleIndex).toContain("Find a book");
    expect(bibleIndex.indexOf("<TopicDiscovery />")).toBeLessThan(
      bibleIndex.indexOf('aria-labelledby="find-a-book"'),
    );
  });

  it("does not import the full Bible corpus into topic discovery", () => {
    const topicModule = readFileSync("src/lib/bible/topics.ts", "utf8");

    expect(topicModule).not.toContain("@/data/bible/");
    expect(topicModule).not.toContain("loadChapterClient");
    expect(topicModule).not.toContain("loadChapter(");
  });

  it("uses unique topics with multiple reviewed starting points", () => {
    const slugs = SCRIPTURE_TOPICS.map((topic) => topic.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    expect(SCRIPTURE_TOPICS.length).toBeGreaterThanOrEqual(12);
    for (const topic of SCRIPTURE_TOPICS) {
      expect(topic.keywords.length).toBeGreaterThan(0);
      expect(topic.passages.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("points every reviewed range at verses that exist in the local Bible", async () => {
    for (const topic of SCRIPTURE_TOPICS) {
      for (const passage of topic.passages) {
        const chapter = await loadChapter(passage.bookSlug, passage.chapter);
        const verseEnd = passage.verseEnd ?? passage.verseStart;

        expect(chapter, passage.reference).not.toBeNull();
        expect(passage.verseStart, passage.reference).toBeGreaterThanOrEqual(1);
        expect(verseEnd, passage.reference).toBeGreaterThanOrEqual(
          passage.verseStart,
        );
        expect(verseEnd, passage.reference).toBeLessThanOrEqual(
          chapter?.verses.length ?? 0,
        );
        expect(passage.reference).toContain(
          `${passage.chapter}:${passage.verseStart}`,
        );
      }
    }
  });

  it("opens exact verse ranges through the existing reader link builder", () => {
    const forgiveness = SCRIPTURE_TOPICS[0].passages[0];
    const hope = SCRIPTURE_TOPICS.find((topic) => topic.slug === "hope")!
      .passages[0];

    withPlatform(undefined, () => {
      expect(topicPassageHref(forgiveness)).toBe(
        "/app/bible/matthew/6?verse=14-15#verse-14",
      );
      expect(topicPassageHref(hope)).toBe(
        "/app/bible/romans/15?verse=13#verse-13",
      );
    });
    withPlatform("native", () => {
      expect(topicPassageHref(forgiveness)).toBe(
        "/app/bible/read?book=matthew&chapter=6&verse=14-15#verse-14",
      );
    });
  });
});
