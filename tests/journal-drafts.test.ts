import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  JOURNAL_DRAFT_MAX_AGE_MS,
  clearAllDeviceLocalJournalDrafts,
  clearDeviceLocalJournalDraft,
  journalDraftStorageKey,
  purgeExpiredDeviceLocalJournalDrafts,
  readDeviceLocalJournalDraft,
  writeDeviceLocalJournalDraft,
} from "@/lib/questos/journal-drafts";

describe("device-local journal drafts", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T16:00:00.000Z"));
  });

  it("round-trips JSON-safe composer fields without mixing draft scopes", () => {
    expect(
      writeDeviceLocalJournalDraft(
        "prayer",
        undefined,
        { title: "A beginning", body: "Please help.", category: "general" },
      ),
    ).toBe(true);
    expect(
      writeDeviceLocalJournalDraft(
        "reflection",
        "reflection-1",
        { body: "A thought", mood: "tender" },
      ),
    ).toBe(true);

    expect(readDeviceLocalJournalDraft("prayer")?.fields).toEqual({
      title: "A beginning",
      body: "Please help.",
      category: "general",
    });
    expect(
      readDeviceLocalJournalDraft("reflection", "reflection-1")?.fields,
    ).toEqual({ body: "A thought", mood: "tender" });
    expect(readDeviceLocalJournalDraft("reflection")).toBeNull();
  });

  it("uses opaque kind/id scope keys rather than draft content", () => {
    const key = journalDraftStorageKey("prayer", "entry/id with space");

    expect(key).toBe(
      "biblequest:journal-draft:prayer:entry%2Fid%20with%20space",
    );
    expect(key).not.toContain("private words");
  });

  it("purges malformed and mismatched envelopes instead of restoring them", () => {
    const key = journalDraftStorageKey("prayer");
    window.localStorage.setItem(key, "not json");

    expect(readDeviceLocalJournalDraft("prayer")).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();

    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        kind: "reflection",
        entryId: null,
        fields: { body: "wrong scope" },
        updatedAt: new Date().toISOString(),
        clearEpoch: null,
      }),
    );
    expect(readDeviceLocalJournalDraft("prayer")).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("expires abandoned sensitive drafts after thirty days", () => {
    const key = journalDraftStorageKey("reflection");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        kind: "reflection",
        entryId: null,
        fields: { body: "old private text" },
        updatedAt: new Date(Date.now() - JOURNAL_DRAFT_MAX_AGE_MS - 1).toISOString(),
        clearEpoch: null,
      }),
    );

    expect(readDeviceLocalJournalDraft("reflection")).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("clears only the requested kind and entry scope", () => {
    writeDeviceLocalJournalDraft("prayer", undefined, { body: "new" });
    writeDeviceLocalJournalDraft("prayer", "existing", { body: "edit" });

    expect(clearDeviceLocalJournalDraft("prayer", "existing")).toBe(true);
    expect(readDeviceLocalJournalDraft("prayer", "existing")).toBeNull();
    expect(readDeviceLocalJournalDraft("prayer")?.fields).toEqual({ body: "new" });
  });

  it("clears every journal draft without touching unrelated device data", () => {
    writeDeviceLocalJournalDraft("prayer", undefined, { body: "new" });
    writeDeviceLocalJournalDraft("reflection", "existing", { body: "edit" });
    window.localStorage.setItem("biblequest:unrelated", "keep");

    expect(clearAllDeviceLocalJournalDrafts()).toBe(2);
    expect(readDeviceLocalJournalDraft("prayer")).toBeNull();
    expect(readDeviceLocalJournalDraft("reflection", "existing")).toBeNull();
    expect(window.localStorage.getItem("biblequest:unrelated")).toBe("keep");
    expect(
      window.localStorage.getItem("biblequest:journal-drafts-cleared-at"),
    ).toBeTruthy();
  });

  it("sweeps expired and malformed drafts at the next application launch", () => {
    writeDeviceLocalJournalDraft("prayer", undefined, { body: "current" });
    const staleKey = journalDraftStorageKey("reflection", "stale");
    window.localStorage.setItem(
      staleKey,
      JSON.stringify({
        version: 2,
        kind: "reflection",
        entryId: "stale",
        fields: { body: "old private text" },
        updatedAt: new Date(
          Date.now() - JOURNAL_DRAFT_MAX_AGE_MS - 1,
        ).toISOString(),
        clearEpoch: null,
      }),
    );
    window.localStorage.setItem(
      "biblequest:journal-draft:prayer:malformed",
      "not json",
    );

    expect(purgeExpiredDeviceLocalJournalDrafts()).toBe(2);
    expect(readDeviceLocalJournalDraft("prayer")?.fields).toEqual({
      body: "current",
    });
    expect(window.localStorage.getItem(staleKey)).toBeNull();
  });

  it("rejects every draft written against an older destructive-clear epoch", () => {
    expect(
      writeDeviceLocalJournalDraft("prayer", undefined, { body: "before" }),
    ).toBe(true);
    window.localStorage.setItem(
      "biblequest:journal-drafts-cleared-at",
      "2026-07-19T16:01:00.000Z:reset",
    );

    expect(readDeviceLocalJournalDraft("prayer")).toBeNull();
    expect(
      writeDeviceLocalJournalDraft(
        "prayer",
        undefined,
        { body: "stale tab" },
        undefined,
        null,
      ),
    ).toBe(false);
    expect(readDeviceLocalJournalDraft("prayer")).toBeNull();

    expect(
      writeDeviceLocalJournalDraft("prayer", undefined, { body: "after" }),
    ).toBe(true);
    expect(readDeviceLocalJournalDraft("prayer")?.fields).toEqual({
      body: "after",
    });
  });

  it("retries the clear epoch after a quota failure before the final sweep", () => {
    let rejectFirstEpoch = true;
    const quotaStorage = {
      get length() {
        return window.localStorage.length;
      },
      clear() {
        window.localStorage.clear();
      },
      getItem(key: string) {
        return window.localStorage.getItem(key);
      },
      key(index: number) {
        return window.localStorage.key(index);
      },
      removeItem(key: string) {
        window.localStorage.removeItem(key);
      },
      setItem(key: string, value: string) {
        if (
          key === "biblequest:journal-drafts-cleared-at" &&
          rejectFirstEpoch
        ) {
          rejectFirstEpoch = false;
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        window.localStorage.setItem(key, value);
      },
    } satisfies Storage;

    expect(
      writeDeviceLocalJournalDraft(
        "reflection",
        undefined,
        { body: "private text occupying storage" },
        quotaStorage,
      ),
    ).toBe(true);

    expect(clearAllDeviceLocalJournalDrafts(quotaStorage)).toBe(1);
    expect(
      quotaStorage.getItem("biblequest:journal-drafts-cleared-at"),
    ).toBeTruthy();
    expect(
      writeDeviceLocalJournalDraft(
        "reflection",
        undefined,
        { body: "stale tab" },
        quotaStorage,
        null,
      ),
    ).toBe(false);
    expect(readDeviceLocalJournalDraft("reflection", undefined, quotaStorage)).toBeNull();
  });

  it("fails quietly when browser privacy or quota settings reject storage", () => {
    const throwingStorage = {
      get length() {
        return 0;
      },
      clear() {
        throw new Error("blocked");
      },
      getItem() {
        throw new Error("blocked");
      },
      key() {
        return null;
      },
      removeItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("quota");
      },
    } satisfies Storage;

    expect(
      writeDeviceLocalJournalDraft(
        "prayer",
        undefined,
        { body: "not persisted" },
        throwingStorage,
      ),
    ).toBe(false);
    expect(
      readDeviceLocalJournalDraft("prayer", undefined, throwingStorage),
    ).toBeNull();
    expect(
      clearDeviceLocalJournalDraft("prayer", undefined, throwingStorage),
    ).toBe(false);
  });
});
