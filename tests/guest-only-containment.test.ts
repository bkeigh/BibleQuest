import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "./fixtures";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServerClient: vi.fn(),
  createServerSupabase: vi.fn(),
}));

// Allows Vitest to exercise the server-only console callback boundary.
vi.mock("server-only", () => ({}));

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
    expect(markup).not.toContain("Email me a sign-in code");
    expect(markup).not.toContain("Sign in with Google");
    expect(markup).not.toContain("Sign in with Apple");
    expect(markup).not.toContain("<input");
  });

  it("removes every reviewer-visible account and reminder invitation", () => {
    const prompt = readFileSync(
      "src/components/account/AccountPrompt.tsx",
      "utf8",
    );
    const onboarding = readFileSync(
      "src/components/onboarding/OnboardingFlow.tsx",
      "utf8",
    );
    const settings = readFileSync(
      "src/components/settings/SettingsScreen.tsx",
      "utf8",
    );
    const reminders = readFileSync(
      "src/components/settings/ReminderSettings.tsx",
      "utf8",
    );

    expect(prompt).toContain("accountSyncAvailable(configured)");
    expect(onboarding).toContain(
      "accountEnabled={accountSyncAvailable(configured)}",
    );
    expect(onboarding).toContain("Continue on this device");
    expect(settings).toMatch(
      /\{!ACCOUNT_SYNC_CONTAINED \? \([\s\S]*?<SectionTitle>\{t\.settings\.account\}/,
    );
    expect(settings).toMatch(
      /\{!ACCOUNT_SYNC_CONTAINED \? \([\s\S]*?label=\{t\.settings\.reminders\}/,
    );
    expect(reminders).toContain("Reminders are not included in this release");
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

  it("refreshes an independent console session while customer sync stays contained", async () => {
    vi.stubEnv("BIBLEQUEST_CONSOLE_AUTH_ENABLED", "true");
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const response = await proxy(
      new NextRequest("https://console.biblequest.co/insights", {
        headers: { host: "console.biblequest.co" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createServerClient).toHaveBeenCalledOnce();
    expect(response.headers.get("x-middleware-rewrite")).toContain(
      "/console/insights",
    );
  });

  it("allows only a configured console callback through containment", async () => {
    vi.stubEnv("BIBLEQUEST_CONSOLE_AUTH_ENABLED", "true");
    vi.stubEnv(
      "BIBLEQUEST_CONSOLE_ALLOWED_EMAILS",
      "operator@biblequest.co",
    );
    mocks.createServerSupabase.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { user: { email: "operator@biblequest.co" } },
          error: null,
        }),
      },
    });

    const response = await authCallback(
      new Request(
        "https://console.biblequest.co/auth/callback?code=operator-code&next=%2F",
      ),
    );

    expect(mocks.createServerSupabase).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://console.biblequest.co/",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("removes a non-operator console callback session", async () => {
    vi.stubEnv("BIBLEQUEST_CONSOLE_AUTH_ENABLED", "true");
    vi.stubEnv(
      "BIBLEQUEST_CONSOLE_ALLOWED_EMAILS",
      "operator@biblequest.co",
    );
    const signOut = vi.fn().mockResolvedValue({ error: null });
    mocks.createServerSupabase.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { user: { email: "customer@example.com" } },
          error: null,
        }),
        signOut,
      },
    });

    const response = await authCallback(
      new Request(
        "https://console.biblequest.co/auth/callback?code=customer-code&next=%2F",
      ),
    );

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://console.biblequest.co/sign-in",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("has one explicit re-enable latch after migration verification", () => {
    expect(accountSyncAvailable(true, true)).toBe(false);
    expect(accountSyncAvailable(true, false)).toBe(true);
    expect(accountSyncAvailable(false, false)).toBe(false);
  });
});
