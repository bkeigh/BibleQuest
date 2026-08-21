import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isModernSupabasePublishableKey,
  supabasePublishableKey,
} from "@/native/guest/lib/supabase/config";
import { supabasePublishableKey as canonicalSupabasePublishableKey } from "@/lib/supabase/config";
import {
  fetchNativeAccountBetaAvailability,
  refreshNativeAccountBetaAvailability,
  requireNativeAccountBetaAvailability,
} from "@/native/guest/lib/sync/availability";
import {
  assertNativeAccountBetaAvailability,
  NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE,
  parseNativeAccountBetaAvailability,
} from "@/native/guest/lib/sync/native-beta-contract";
import {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
  EXPECTED_ACCOUNT_USER_HEADER,
  NATIVE_ACCOUNT_BETA_CONTRACT,
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_BETA_HEADER_VALUE,
} from "@/native/guest/lib/sync/native-beta-headers";
import {
  ACCOUNT_SYNC_GENERATION_HEADER,
  AVATAR_UPDATED_AT_HEADER,
  AVATAR_VERSION_HEADER,
  GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS,
  WEB_AUTH_PROTOCOL_HEADER,
} from "@/lib/sync/native-account-markers.mjs";
import { GUEST_RELEASE_OVERLAYS } from "@/lib/sync/guest-release-overlays.mjs";
import {
  ACCOUNT_SYNC_GENERATION_HEADER as GUEST_ACCOUNT_SYNC_GENERATION_HEADER,
  AVATAR_UPDATED_AT_HEADER as GUEST_AVATAR_UPDATED_AT_HEADER,
  AVATAR_VERSION_HEADER as GUEST_AVATAR_VERSION_HEADER,
  requireAccountWireHeader as requireGuestAccountWireHeader,
  WEB_AUTH_PROTOCOL_HEADER as GUEST_WEB_AUTH_PROTOCOL_HEADER,
} from "@/native/guest/lib/sync/native-account-markers.mjs";
import {
  beginReviewedWebPrivateRemoval,
  beginWebPrivateWrite,
  readActiveWebAuthSession,
  readWebAuthState,
  reviewedWebPrivateWriteRemovalAllowed,
  webPrivateRemovalGuardIsCurrent,
  webPrivateWriteGuardIsCurrent,
  withInteractiveWebAccountOperationLock,
  withWebAccountOperationLock,
  withWebAuthStorageLock,
} from "@/native/guest/lib/supabase/web-auth-storage";
import {
  LEGACY_GAME_STORAGE_KEY,
  LEGACY_QUEST_JOURNEY_STORAGE_KEY,
  readWebPrivateNamespaceState,
  selectedWebPrivateStorageKey,
  WEB_V2_GAME_STORAGE_KEY,
  WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
} from "@/native/guest/lib/storage/web-private-namespace";
import { useArcadeAccess as guestArcadeAccess } from "@/native/guest/lib/games/arcade/useArcadeAccess";
import {
  purchaseAdapter as guestPurchaseAdapter,
  webCommerceAvailable as guestWebCommerceAvailable,
} from "@/native/guest/lib/platform/purchases";

const GUEST_MODULES = [
  "src/native/guest/lib/supabase/config.ts",
  "src/native/guest/lib/sync/availability.ts",
  "src/native/guest/lib/sync/native-account-markers.mjs",
  "src/native/guest/lib/sync/native-beta-contract.ts",
  "src/native/guest/lib/sync/native-beta-headers.ts",
  "src/native/guest/lib/supabase/useSession.ts",
  "src/native/guest/lib/supabase/web-auth-storage.ts",
  "src/native/guest/lib/storage/web-private-namespace.ts",
  "src/native/guest/lib/platform/api.ts",
  "src/native/guest/lib/platform/purchases.ts",
  "src/native/guest/lib/billing/usePlus.ts",
  "src/native/guest/lib/native/journey-backup.ts",
  "src/native/guest/lib/auth/onboarding-resume.ts",
  "src/native/guest/lib/analytics/events.ts",
  "src/native/guest/lib/questos/purge.ts",
  "src/native/guest/lib/storage/device-private-storage.ts",
  "src/native/guest/lib/storage/device-private-write.ts",
  "src/native/guest/lib/games/arcade/useArcadeAccess.ts",
  "src/native/guest/components/account/AccountScreen.tsx",
  "src/native/guest/components/account/AccountPrompt.tsx",
  "src/native/guest/components/account/SignInMethods.tsx",
  "src/native/guest/components/app-shell/AccountGate.tsx",
  "src/native/guest/components/app-shell/NativeJourneyGuard.tsx",
  "src/native/guest/components/app-shell/ServiceWorkerRegistrar.tsx",
  "src/native/guest/components/app-shell/AvatarSyncManager.tsx",
  "src/native/guest/components/app-shell/SyncManager.tsx",
  "src/native/guest/components/onboarding/OnboardingGate.tsx",
  "src/native/guest/components/settings/SettingsScreen.tsx",
];

const EXPECTED_FORBIDDEN_MARKERS = [
  "x-biblequest-native-account-beta",
  "biblequest_native_account_beta_v1",
  "native_account_beta_availability",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "x-biblequest-expected-user",
  "x-biblequest-account-deletion-cleanup",
  "x-biblequest-disabled",
  "native_account_beta_unavailable",
  "x-biblequest-sync-generation",
  "x-biblequest-web-auth",
  "X-BibleQuest-Avatar-Version",
  "X-BibleQuest-Avatar-Updated-At",
];

const ACCOUNT_WIRE_MARKER_CONSUMERS = [
  "src/lib/supabase/client.ts",
  "src/lib/supabase/web-auth-protocol.ts",
  "src/lib/supabase/web-auth-storage.ts",
  "src/lib/avatar/client.ts",
  "src/app/api/profile/avatar/route.ts",
  "src/lib/http/native-cors.ts",
];

/** Builds a harmless legacy anonymous JWT shape accepted by canonical fallback. */
function legacyAnonymousKeyFixture(): string {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"),
    Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url"),
    "fixture-signature",
  ].join(".");
}

afterEach(() => vi.unstubAllGlobals());

describe("guest native account modules", () => {
  it("keeps every web purchase adapter closed even when callers inject web dependencies", async () => {
    const fetcher = vi.fn();
    const navigate = vi.fn();
    const purchases = guestPurchaseAdapter({
      runtime: { target: "web" },
      fetcher,
      navigate,
    });

    expect(guestWebCommerceAvailable({ target: "web" })).toBe(false);
    expect(purchases).toMatchObject({ channel: "native", available: false });
    await expect(purchases.purchase("fixture-user", "monthly")).resolves.toBe(
      "unavailable",
    );
    await expect(purchases.restore("fixture-user")).resolves.toBe("unavailable");
    await expect(purchases.manage("fixture-user")).resolves.toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps every arcade purchase action absent from guest builds", async () => {
    const arcade = guestArcadeAccess();

    expect(arcade).toMatchObject({
      available: false,
      gamePass: false,
      questionSkips: 0,
      loading: false,
      signedIn: false,
      error: null,
    });
    await expect(arcade.refresh()).resolves.toBeUndefined();
    await expect(arcade.startCheckout("game-pass")).resolves.toBe(false);
    await expect(arcade.consumeQuestionSkip("fixture-chapter")).resolves.toBe(
      false,
    );
  });

  it("rejects configuration, probes, and authenticated contract checks", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const rpc = vi.fn();
    const keyCandidate = `sb_publishable_${"a".repeat(32)}`;
    const legacyKeyCandidate = legacyAnonymousKeyFixture();

    expect(isModernSupabasePublishableKey(keyCandidate)).toBe(false);
    expect(
      supabasePublishableKey({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keyCandidate,
      }),
    ).toBeNull();
    expect(
      supabasePublishableKey({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyKeyCandidate,
      }),
    ).toBeNull();
    expect(
      canonicalSupabasePublishableKey({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: legacyKeyCandidate,
      }),
    ).toBe(legacyKeyCandidate);
    await expect(
      fetchNativeAccountBetaAvailability({
        fetcher,
        publishableKey: keyCandidate,
        supabaseOrigin: "https://abcdefghijklmnopqrst.supabase.co",
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(requireNativeAccountBetaAvailability()).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(
      assertNativeAccountBetaAvailability({ rpc } as unknown as SupabaseClient),
    ).rejects.toMatchObject({ code: "unavailable" });

    expect(fetcher).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    await expect(refreshNativeAccountBetaAvailability()).resolves.toBe(false);
    expect(parseNativeAccountBetaAvailability({})).toBeNull();
    expect(NATIVE_ACCOUNT_BETA_CONTRACT).toBe("disabled");
    expect(NATIVE_ACCOUNT_BETA_HEADER).toBe("");
    expect(NATIVE_ACCOUNT_BETA_HEADER_VALUE).toBe("");
    expect(EXPECTED_ACCOUNT_USER_HEADER).toBe("");
    expect(ACCOUNT_DELETION_CLEANUP_HEADER).toBe("");
    expect(ACCOUNT_DELETION_CLEANUP_HEADER_VALUE).toBe("");
    expect(NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE).toBe("unavailable");
    expect(GUEST_ACCOUNT_SYNC_GENERATION_HEADER).toBe("");
    expect(GUEST_WEB_AUTH_PROTOCOL_HEADER).toBe("");
    expect(GUEST_AVATAR_VERSION_HEADER).toBe("");
    expect(GUEST_AVATAR_UPDATED_AT_HEADER).toBe("");
    for (const [header, value] of [
      [NATIVE_ACCOUNT_BETA_HEADER, NATIVE_ACCOUNT_BETA_HEADER_VALUE],
      [EXPECTED_ACCOUNT_USER_HEADER, "fixture-user"],
      [
        ACCOUNT_DELETION_CLEANUP_HEADER,
        ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
      ],
    ]) {
      expect(() => new Headers().set(header, value)).toThrow(TypeError);
    }
    for (const header of [
      GUEST_ACCOUNT_SYNC_GENERATION_HEADER,
      GUEST_WEB_AUTH_PROTOCOL_HEADER,
      GUEST_AVATAR_VERSION_HEADER,
      GUEST_AVATAR_UPDATED_AT_HEADER,
    ]) {
      expect(() => requireGuestAccountWireHeader(header)).toThrow(
        "Account wire header is unavailable.",
      );
    }
  });

  it("keeps device storage local while every account operation stays closed", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    vi.stubGlobal("localStorage", storage);
    const accountCallback = vi.fn(async () => true);
    const localCallback = vi.fn(async () => {
      storage.setItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY, "fixture");
      return true;
    });

    expect(readWebPrivateNamespaceState(storage)).toBe("legacy");
    expect(WEB_V2_QUEST_JOURNEY_STORAGE_KEY).toBe(
      LEGACY_QUEST_JOURNEY_STORAGE_KEY,
    );
    expect(WEB_V2_GAME_STORAGE_KEY).toBe(LEGACY_GAME_STORAGE_KEY);
    expect(
      selectedWebPrivateStorageKey(
        storage,
        LEGACY_QUEST_JOURNEY_STORAGE_KEY,
        WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
      ),
    ).toBe(LEGACY_QUEST_JOURNEY_STORAGE_KEY);
    expect(reviewedWebPrivateWriteRemovalAllowed()).toBe(true);
    const writeGuard = beginWebPrivateWrite();
    const removalGuard = beginReviewedWebPrivateRemoval();
    expect(writeGuard && webPrivateWriteGuardIsCurrent(writeGuard)).toBe(true);
    expect(
      removalGuard && webPrivateRemovalGuardIsCurrent(removalGuard),
    ).toBe(true);
    await expect(withWebAuthStorageLock(localCallback)).resolves.toBe(true);
    await expect(
      withWebAccountOperationLock(accountCallback),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      withInteractiveWebAccountOperationLock(accountCallback),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(accountCallback).not.toHaveBeenCalled();
    expect(await readWebAuthState()).toEqual({ status: "unavailable" });
    expect(await readActiveWebAuthSession()).toBeNull();
    expect(storage.getItem(LEGACY_QUEST_JOURNEY_STORAGE_KEY)).toBe("fixture");

  });

  it("derives the reviewed native account scan from the shared contract", () => {
    const builder = readFileSync("scripts/build-native.mjs", "utf8");
    expect(new Set(GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS)).toEqual(
      new Set(EXPECTED_FORBIDDEN_MARKERS),
    );
    expect(builder).toMatch(
      /function stageGuestAccountContainment\(\) \{\s*if \(!releaseBuild\) return;/,
    );
    expect(builder).toContain("stageGuestAccountContainment();");
    expect(builder).toContain("verifyGuestAccountMarkersAbsent();");
    expect(builder).toContain("GUEST_FORBIDDEN_ACCOUNT_ARTIFACT_LITERALS");
    expect(builder).toContain("findGuestAccountArtifactViolation");
    expect(builder).not.toContain("GUEST_ACCOUNT_HEADER_PATTERN");
    expect(builder).not.toMatch(
      /const GUEST_FORBIDDEN_ACCOUNT_MARKERS\s*=\s*\[/,
    );
    expect(builder).toContain("GUEST_RELEASE_OVERLAYS");
    expect(new Set(GUEST_RELEASE_OVERLAYS.map(([source]) => source))).toEqual(
      new Set(GUEST_MODULES),
    );
    expect(builder.lastIndexOf("stageGuestAccountContainment();")).toBeLessThan(
      builder.lastIndexOf("build();"),
    );

    for (const path of GUEST_MODULES) {
      const source = readFileSync(path, "utf8");
      for (const marker of GUEST_FORBIDDEN_NATIVE_ACCOUNT_MARKERS) {
        expect(source, `${path}: ${marker}`).not.toContain(marker);
      }
    }

    expect(ACCOUNT_SYNC_GENERATION_HEADER).toBe(
      "x-biblequest-sync-generation",
    );
    expect(
      readFileSync(
        "supabase/migrations/0018_bind_account_sync_identity_and_generation.sql",
        "utf8",
      ),
    ).toContain(`headers->>'${ACCOUNT_SYNC_GENERATION_HEADER}'`);
    expect(WEB_AUTH_PROTOCOL_HEADER).toBe("x-biblequest-web-auth");
    expect(AVATAR_VERSION_HEADER).toBe("X-BibleQuest-Avatar-Version");
    expect(AVATAR_UPDATED_AT_HEADER).toBe(
      "X-BibleQuest-Avatar-Updated-At",
    );
    for (const path of ACCOUNT_WIRE_MARKER_CONSUMERS) {
      const source = readFileSync(path, "utf8");
      for (const marker of EXPECTED_FORBIDDEN_MARKERS.slice(-4)) {
        expect(source.toLowerCase(), `${path}: ${marker}`).not.toContain(
          marker.toLowerCase(),
        );
      }
    }
  });

  it("keeps every staged module's export names aligned", async () => {
    const pairs = await Promise.all([
      Promise.all([
        import("@/lib/supabase/config"),
        import("@/native/guest/lib/supabase/config"),
      ]),
      Promise.all([
        import("@/lib/sync/native-beta-headers"),
        import("@/native/guest/lib/sync/native-beta-headers"),
      ]),
      Promise.all([
        import("@/lib/sync/native-account-markers.mjs"),
        import("@/native/guest/lib/sync/native-account-markers.mjs"),
      ]),
      Promise.all([
        import("@/lib/sync/native-beta-contract"),
        import("@/native/guest/lib/sync/native-beta-contract"),
      ]),
      Promise.all([
        import("@/lib/sync/availability"),
        import("@/native/guest/lib/sync/availability"),
      ]),
    ]);

    for (const [canonical, guest] of pairs) {
      expect(Object.keys(guest).sort()).toEqual(Object.keys(canonical).sort());
    }
  });
});
