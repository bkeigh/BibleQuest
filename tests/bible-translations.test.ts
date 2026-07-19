import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bibleBooks } from "@/lib/bible";
import { providerBookId } from "@/lib/bible/provider-books";
import {
  joinApiBibleVerseRange,
  parseApiBibleContent,
} from "@/lib/bible/api-bible-content";
import {
  DEFAULT_BIBLE_TRANSLATION_KEY,
  FEATURED_TRANSLATIONS,
  HELLOAO_OPEN_TRANSLATIONS,
  WEB_TRANSLATION,
  bibleTranslationKey,
  normalizeBibleTranslationKey,
  translationMetadata,
  translationPreferenceLabel,
} from "@/lib/bible/translations";
import { DEFAULT_SETTINGS } from "@/lib/questos/types";
import { rowsToSettings, settingsToRows } from "@/lib/sync/mapping";

describe("Bible translation preference and licensing boundary", () => {
  it("stores NIV as the preferred default while keeping WEB as the only bundled edition", () => {
    expect(DEFAULT_BIBLE_TRANSLATION_KEY).toBe("niv");
    expect(DEFAULT_SETTINGS.preferredBibleTranslation).toBe("niv");
    expect(WEB_TRANSLATION.availability).toBe("bundled");
    expect(WEB_TRANSLATION.name).toBe("World English Bible");
    expect(
      FEATURED_TRANSLATIONS.filter((item) => item.availability === "bundled").map(
        (item) => item.key,
      ),
    ).toEqual(["web"]);
    expect(FEATURED_TRANSLATIONS.map((item) => item.abbreviation)).toEqual(
      expect.arrayContaining(["NIV", "KJV", "NLT", "ESV", "NKJV", "WEB"]),
    );
    expect(translationPreferenceLabel("niv")).toBe("NIV");
  });

  it("maps every bundled Protestant-canon book to a provider id", () => {
    expect(bibleBooks).toHaveLength(66);
    for (const book of bibleBooks) {
      expect(providerBookId(book.slug), book.slug).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  it("accepts only bounded featured or connected translation keys in reader URLs", () => {
    expect(bibleTranslationKey("niv")).toBe("niv");
    expect(bibleTranslationKey("web")).toBe("web");
    expect(bibleTranslationKey("api:0123456789abcdef-01")).toBe(
      "api:0123456789abcdef-01",
    );
    expect(bibleTranslationKey("api:not-a-provider-id")).toBeUndefined();
    expect(bibleTranslationKey("javascript:alert(1)")).toBeUndefined();
    expect(bibleTranslationKey("x".repeat(81))).toBeUndefined();
  });

  it("accepts only reviewed HelloAO keys and keeps KJV on the licensed boundary", () => {
    expect(HELLOAO_OPEN_TRANSLATIONS.map((item) => item.key)).toEqual([
      "bsb",
      "helloao:spa_r09",
      "helloao:deu_l12",
      "helloao:cmn_cu1",
      "helloao:arb_vdv",
    ]);
    expect(bibleTranslationKey(" HELLOAO:SPA_R09 ")).toBe(
      "helloao:spa_r09",
    );
    expect(bibleTranslationKey("helloao:eng_kjv")).toBeUndefined();
    expect(normalizeBibleTranslationKey("helloao:not_reviewed")).toBe("niv");
    expect(translationMetadata("bsb")).toMatchObject({
      source: "helloao",
      contentUsePolicy: "public_domain",
      availability: "open",
    });
    expect(translationMetadata("kjv")).toMatchObject({
      source: "api_bible",
      contentUsePolicy: "licensed_transient",
      availability: "provider_required",
    });
  });

  it("parses provider JSON by verse without leaking section headings", () => {
    const parsed = parseApiBibleContent([
      {
        name: "para",
        type: "tag",
        items: [{ type: "text", text: "A heading without a verse id" }],
      },
      {
        name: "para",
        type: "tag",
        items: [
          {
            name: "verse",
            type: "tag",
            attrs: { number: "1", sid: "JHN 1:1" },
            items: [{ type: "text", text: "1" }],
          },
          {
            type: "text",
            text: " In the beginning ",
            attrs: { verseId: "JHN.1.1" },
          },
          {
            name: "verse",
            type: "tag",
            attrs: { number: "2", sid: "JHN 1:2" },
            items: [{ type: "text", text: "2" }],
          },
          {
            type: "text",
            text: " the Word was with God. ",
            attrs: { verseOrgIds: ["JHN.1.2"] },
          },
        ],
      },
    ]);
    expect(Object.fromEntries(parsed)).toEqual({
      1: "In the beginning",
      2: "the Word was with God.",
    });
  });

  it("resolves documented verse suffixes and grouped provider spans", () => {
    const parsed = parseApiBibleContent([
      {
        name: "para",
        type: "tag",
        items: [
          {
            name: "verse",
            type: "tag",
            attrs: { number: "2-6a", sid: "MAT 1:2-6a" },
          },
          {
            type: "text",
            text: " A grouped thought. ",
            attrs: { verseOrgIds: ["MAT.1.2-MAT.1.6a"] },
          },
          {
            name: "verse",
            type: "tag",
            attrs: { number: "7a", sid: "MAT 1:7a" },
          },
          {
            type: "text",
            text: " A suffixed verse. ",
            attrs: { verseId: "MAT.1.7a" },
          },
          {
            name: "verse",
            type: "tag",
            attrs: { number: "8b" },
          },
          { type: "text", text: " A numbered marker fallback. " },
        ],
      },
    ]);

    expect([...parsed.keys()]).toEqual([2, 3, 4, 5, 6, 7, 8]);
    for (const verse of [2, 3, 4, 5, 6]) {
      expect(parsed.get(verse)).toBe("A grouped thought.");
    }
    expect(parsed.get(7)).toBe("A suffixed verse.");
    expect(parsed.get(8)).toBe("A numbered marker fallback.");
    expect(joinApiBibleVerseRange(parsed, 4, 7)).toBe(
      "A grouped thought. A suffixed verse.",
    );
  });

  it("round-trips the preference through account settings mapping", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      preferredBibleTranslation: "nlt",
    };
    const rows = settingsToRows("user-a", settings);
    expect(rows.settings.preferred_bible_translation).toBe("nlt");
    expect(rowsToSettings(rows.settings, rows.notifications)).toEqual({
      ...settings,
      // Bold text remains intentionally device-local in the sync mapping.
      appearance: { ...settings.appearance, boldText: false },
    });
  });

  it("ships the store migration and database column without copyrighted text", () => {
    const store = readFileSync(
      path.join(process.cwd(), "src/lib/questos/store.ts"),
      "utf8",
    );
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/0011_bible_translation_preference.sql",
      ),
      "utf8",
    );
    expect(store).toContain("version: 9");
    expect(store).toContain('settings.preferredBibleTranslation = "niv"');
    expect(migration).toContain("preferred_bible_translation");
    expect(migration).not.toMatch(/insert\s+into\s+.*bible_(?:verses|chapters)/i);
  });

  it("keeps provider secrets server-only and requires an explicit commercial allow-list", () => {
    const provider = readFileSync(
      path.join(process.cwd(), "src/lib/bible/api-bible.ts"),
      "utf8",
    );
    expect(provider).toContain("API_BIBLE_API_KEY");
    expect(provider).toContain(
      "API_BIBLE_COMMERCIALLY_LICENSED_BIBLE_IDS",
    );
    expect(provider).toContain("API_BIBLE_ALLOWED_BIBLE_IDS");
    expect(provider).not.toContain("NEXT_PUBLIC_API_BIBLE");
    expect(provider).not.toContain('preferenceKey === "niv"');
    expect(provider).not.toContain('preferenceKey === "esv"');
  });
});
