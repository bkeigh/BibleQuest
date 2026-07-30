import { describe, expect, it, vi } from "vitest";
import { currentSnapshot, emptySnapshot } from "./fixtures";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
  isSupabaseConfigured: () => false,
}));

vi.mock("@/lib/analytics/events", () => ({
  track: vi.fn(),
  setAnalyticsConsent: vi.fn(),
}));

import {
  mergeSnapshots,
  syncedProfileChanged,
} from "@/lib/sync/engine";

describe("device-local profile and appearance sync", () => {
  it("keeps device-only appearance while adopting an account profile", () => {
    const local = emptySnapshot();
    local.settings.appearance.glassOpacity = 23;
    local.settings.appearance.myShepherdFloatingButton = true;

    const remote = currentSnapshot();
    remote.settings.appearance.glassOpacity = 88;
    remote.settings.appearance.myShepherdFloatingButton = false;

    const merged = mergeSnapshots(local, remote);

    expect(merged.profile?.onboardingCompleted).toBe(true);
    expect(merged.settings.appearance.glassOpacity).toBe(23);
    expect(
      merged.settings.appearance.myShepherdFloatingButton,
    ).toBe(true);
  });

  it("keeps a saved profile photo visible while adopting account profile data", () => {
    const local = currentSnapshot();
    local.profile!.avatarUpdatedAt = "2026-07-24T12:00:00.000Z";
    local.profile!.onboardingCompleted = false;

    const remote = currentSnapshot();
    remote.profile!.displayName = "Account name";

    const merged = mergeSnapshots(local, remote);

    expect(merged.profile?.displayName).toBe("Account name");
    expect(merged.profile?.avatarUpdatedAt).toBe(
      "2026-07-24T12:00:00.000Z",
    );
  });

  it("does not dirty generic profile sync for media-only metadata", () => {
    const previous = currentSnapshot().profile!;
    const current = {
      ...previous,
      avatarVersion: "00000000-0000-4000-8000-000000000001",
      avatarUpdatedAt: "2026-07-24T12:00:00.000Z",
    };

    expect(syncedProfileChanged(current, previous)).toBe(false);
    expect(
      syncedProfileChanged(
        { ...current, displayName: "Changed name" },
        current,
      ),
    ).toBe(true);
  });

  it("lets a migrated remote version win over conflicting device metadata", () => {
    const local = currentSnapshot();
    local.profile!.onboardingCompleted = false;
    local.profile!.avatarUpdatedAt = "2026-07-24T12:00:00.000Z";

    const remote = currentSnapshot();
    remote.profile!.avatarVersion =
      "00000000-0000-4000-8000-000000000002";
    remote.profile!.avatarUpdatedAt = "2026-07-24T13:00:00.000Z";

    const merged = mergeSnapshots(local, remote);

    expect(merged.profile?.avatarVersion).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(merged.profile?.avatarUpdatedAt).toBe(
      "2026-07-24T13:00:00.000Z",
    );
  });

  it("lets an explicit migrated remote null clear a stale device marker", () => {
    const local = currentSnapshot();
    local.profile!.onboardingCompleted = false;
    local.profile!.avatarUpdatedAt = "2026-07-24T12:00:00.000Z";

    const remote = currentSnapshot();
    remote.profile!.avatarVersion = null;
    remote.profile!.avatarUpdatedAt = null;

    const merged = mergeSnapshots(local, remote);

    expect(merged.profile?.avatarVersion).toBeNull();
    expect(merged.profile?.avatarUpdatedAt).toBeNull();
  });
});
