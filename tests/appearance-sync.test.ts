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

import { mergeSnapshots } from "@/lib/sync/engine";

describe("device-local profile and appearance sync", () => {
  it("keeps this device's opacity while adopting an account profile", () => {
    const local = emptySnapshot();
    local.settings.appearance.glassOpacity = 23;

    const remote = currentSnapshot();
    remote.settings.appearance.glassOpacity = 88;

    const merged = mergeSnapshots(local, remote);

    expect(merged.profile?.onboardingCompleted).toBe(true);
    expect(merged.settings.appearance.glassOpacity).toBe(23);
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
});
