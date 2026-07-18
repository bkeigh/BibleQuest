import { describe, expect, it } from "vitest";
import { accountRestorePhase } from "@/lib/sync/access";

const signedIn = {
  configured: true,
  sessionLoading: false,
  userId: "account-a",
  syncUserId: "account-a",
  syncState: "idle" as const,
  initialSyncComplete: true,
  handoffPending: false,
  trustedLocalCopy: false,
};

describe("onboarding account restoration boundary", () => {
  it("lets guest and unconfigured deployments continue locally", () => {
    expect(
      accountRestorePhase({ ...signedIn, configured: false })
    ).toBe("ready");
    expect(
      accountRestorePhase({
        ...signedIn,
        userId: null,
        syncUserId: null,
        initialSyncComplete: false,
      })
    ).toBe("ready");
  });

  it("holds a signed-in fresh device until this account's first sync finishes", () => {
    expect(
      accountRestorePhase({
        ...signedIn,
        syncUserId: null,
        syncState: "off",
        initialSyncComplete: false,
      })
    ).toBe("loading");
    expect(
      accountRestorePhase({
        ...signedIn,
        syncState: "syncing",
        initialSyncComplete: false,
      })
    ).toBe("loading");
    expect(
      accountRestorePhase({ ...signedIn, syncUserId: "account-b" })
    ).toBe("loading");
  });

  it("blocks on an initial failure but not a later write-through failure", () => {
    expect(
      accountRestorePhase({
        ...signedIn,
        syncState: "error",
        initialSyncComplete: false,
      })
    ).toBe("initial-sync-error");
    expect(
      accountRestorePhase({ ...signedIn, syncState: "error" })
    ).toBe("ready");
  });

  it("keeps an owned local journey available while background sync retries", () => {
    expect(
      accountRestorePhase({
        ...signedIn,
        syncUserId: null,
        syncState: "error",
        initialSyncComplete: false,
        trustedLocalCopy: true,
      }),
    ).toBe("ready");
  });

  it("keeps the privacy hand-off blocking even with stale successful status", () => {
    expect(
      accountRestorePhase({ ...signedIn, handoffPending: true })
    ).toBe("loading");
  });
});
