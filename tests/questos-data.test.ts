import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuestOS } from "@/lib/questos/store";
import { currentSnapshot, FIXED_NOW } from "./fixtures";

describe("QuestOS clearing, restore, and deletion tombstones", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    useQuestOS.getState().clearAllData();
  });

  it("records per-record deletions so account sync cannot resurrect them", () => {
    useQuestOS.getState().importData(currentSnapshot());
    const fixture = currentSnapshot();

    useQuestOS.getState().deletePrayer(fixture.prayers[0].id);
    useQuestOS.getState().deleteReflection(fixture.reflections[0].id);
    useQuestOS.getState().toggleBookmark({
      bookSlug: fixture.bookmarks[0].bookSlug,
      bookName: fixture.bookmarks[0].bookName,
      chapter: fixture.bookmarks[0].chapter,
      verse: fixture.bookmarks[0].verse,
      text: fixture.bookmarks[0].text,
      note: fixture.bookmarks[0].note,
    });
    useQuestOS.getState().removeQuest("fixture-walk");

    const state = useQuestOS.getState();
    expect(state.prayers.length).toBe(0);
    expect(state.reflections.length).toBe(0);
    expect(state.bookmarks.length).toBe(0);
    expect(Object.keys(state.myQuests).length).toBe(0);
    expect(state.tombstones.prayers).toContain(fixture.prayers[0].id);
    expect(state.tombstones.reflections).toContain(fixture.reflections[0].id);
    expect(state.tombstones.bookmarks).toEqual([
      { bookSlug: "fixture-book", chapter: 1, verse: 1 },
    ]);
    expect(state.tombstones.myQuests).toContain("fixture-walk");
  });

  it("preserves account-purge intent while clearing local data", () => {
    useQuestOS.getState().importData(currentSnapshot());
    useQuestOS.getState().clearAllData({ purgeAccount: "account-a" });

    const state = useQuestOS.getState();
    expect(state.profile).toBeNull();
    expect(state.prayers.length).toBe(0);
    expect(state.reflections.length).toBe(0);
    expect(Object.keys(state.myQuests).length).toBe(0);
    expect(state.tombstones).toEqual({
      prayers: [],
      reflections: [],
      bookmarks: [],
      myQuests: [],
      purgeAccount: "account-a",
    });
  });

  it("replaces old state on restore and scopes the purge to the signed-in account", () => {
    useQuestOS.getState().importData(currentSnapshot());
    useQuestOS.setState({
      tombstones: {
        prayers: ["old-id"],
        reflections: ["old-id"],
        bookmarks: [],
        myQuests: ["old-quest"],
        purgeAccount: null,
      },
    });

    const restored = currentSnapshot();
    restored.myQuests!["fixture-walk"] = {
      ...restored.myQuests!["fixture-walk"],
      status: "archived",
      stepsDone: ["scripture", "live", "reflect"],
    };
    useQuestOS.getState().importData(restored, { purgeAccount: "account-a" });

    const state = useQuestOS.getState();
    expect(state.myQuests["fixture-walk"].status).toBe("archived");
    expect(state.myQuests["fixture-walk"].stepsDone).toEqual([
      "scripture",
      "live",
      "reflect",
    ]);
    expect(state.tombstones.purgeAccount).toBe("account-a");
    expect(state.tombstones.prayers.length).toBe(0);

    state.clearSyncTombstones({
      prayers: [],
      reflections: [],
      bookmarks: [],
      myQuests: [],
      purgeAccount: "account-b",
    });
    expect(useQuestOS.getState().tombstones.purgeAccount).toBe("account-a");
  });
});
