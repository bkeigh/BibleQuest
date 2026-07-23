import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "./fixtures";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServerClient: vi.fn(),
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/analytics/events", () => ({
  track: vi.fn(),
  setAnalyticsConsent: vi.fn(),
}));

// Make both server auth factories observable; containment must reach neither.
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: mocks.createServerSupabase,
  isSupabaseConfigured: () => true,
}));

import { SignInMethods } from "@/components/account/SignInMethods";
import { GET as authCallback } from "@/app/auth/callback/route";
import { useQuestOS } from "@/lib/questos/store";
import {
  ACCOUNT_SYNC_CONTAINED,
  accountSyncContained,
  accountSyncAvailable,
} from "@/lib/sync/containment";
import { retrySync, startSync, stopSync } from "@/lib/sync/engine";
import { useSyncStatus } from "@/lib/sync/status";
import { proxy } from "@/proxy";

describe("guest-only account-sync containment", () => {
  beforeEach(() => {
    stopSync();
    mocks.createClient.mockReset();
    mocks.createServerClient.mockReset();
    mocks.createServerSupabase.mockReset();
    useQuestOS.getState().clearAllData();
    useSyncStatus.setState({
      state: "off",
      lastSyncedAt: null,
      userId: null,
      initialSyncComplete: false,
    });
  });

  it("keeps the default launch build behind a fail-closed latch", () => {
    expect(ACCOUNT_SYNC_CONTAINED).toBe(true);
    expect(accountSyncContained(undefined)).toBe(true);
    expect(accountSyncContained("false")).toBe(true);
    expect(accountSyncContained("TRUE")).toBe(true);
    expect(accountSyncContained("true")).toBe(false);
    expect(accountSyncAvailable(true)).toBe(false);
  });

  it.each(["current 0014 columns", "missing 0014 columns"])(
    "fails closed before probing a database with %s",
    async () => {
      await startSync("account-a");

      expect(ACCOUNT_SYNC_CONTAINED).toBe(true);
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(useSyncStatus.getState()).toMatchObject({
        state: "off",
        userId: null,
        initialSyncComplete: false,
      });
    },
  );

  it("keeps retry fail-closed without starting a client", async () => {
    await retrySync("account-a");
    await retrySync("account-a");

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(useSyncStatus.getState().state).toBe("off");
  });

  it("keeps the deduplicated Journey queue local while offline", async () => {
    vi.stubGlobal("navigator", { doNotTrack: "0", onLine: false });
    const snapshot = emptySnapshot();
    snapshot.prayers = [
      {
        id: "00000000-0000-4000-8000-000000000201",
        body: "fixture-prayer-body",
        category: "general",
        status: "active",
        createdAt: "2026-07-16T12:00:00.000Z",
        updatedAt: "2026-07-16T12:00:00.000Z",
      },
    ];
    snapshot.journeyEvents = [
      {
        id: "00000000-0000-4000-8000-000000000202",
        type: "prayer_created",
        title: "Prayer written",
        sourceId: "prayer:00000000-0000-4000-8000-000000000201",
        dateKey: "2026-07-16",
        occurredAt: "2026-07-16T12:00:00.000Z",
      },
    ];
    snapshot.journeyEvents.push({ ...snapshot.journeyEvents[0] });
    useQuestOS.getState().importData(snapshot);

    await startSync("account-a");
    await retrySync("account-a");

    expect(useQuestOS.getState().journeyEvents).toEqual([
      snapshot.journeyEvents[0],
    ]);
    const persisted = await useQuestOS.persist
      .getOptions()
      .storage?.getItem("biblequest:v1");
    expect(JSON.stringify(persisted)).toContain(snapshot.journeyEvents[0].id);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("removes every sign-in control from the contained client", () => {
    const markup = renderToStaticMarkup(
      createElement(SignInMethods, { source: "account" }),
    );

    expect(markup).toContain("Account sync is temporarily unavailable");
    expect(markup).not.toContain("Email me a sign-in link");
    expect(markup).not.toContain("Continue with Google");
    expect(markup).not.toContain("<input");
  });

  it.each([
    [
      "?code=authorization-secret&next=%2Fapp",
      "https://www.biblequest.co/app/account?error=configuration",
    ],
    [
      "?token_hash=otp-secret&type=magiclink&next=%2Fonboarding",
      "https://www.biblequest.co/onboarding?error=configuration",
    ],
  ])(
    "rejects contained auth callback credentials without exchange: %s",
    async (query, expectedLocation) => {
      const response = await authCallback(
        new Request(`https://www.biblequest.co/auth/callback${query}`),
      );

      expect(mocks.createServerSupabase).not.toHaveBeenCalled();
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(expectedLocation);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("keeps the proxy path from creating a session-refresh client", async () => {
    const response = await proxy(
      new NextRequest("https://www.biblequest.co/app/prayer"),
    );

    expect(response.status).toBe(200);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("has one explicit re-enable latch after migration verification", () => {
    expect(accountSyncAvailable(true, true)).toBe(false);
    expect(accountSyncAvailable(true, false)).toBe(true);
    expect(accountSyncAvailable(false, false)).toBe(false);
  });
});
