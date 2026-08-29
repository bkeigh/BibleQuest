import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  purgeDrafts: vi.fn<() => Promise<boolean>>(),
  purgeJourney: vi.fn<() => boolean>(),
  markClaim: vi.fn<() => Promise<void>>(),
  markInitial: vi.fn<() => Promise<void>>(),
  setOwner: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/questos/journal-drafts", () => ({
  purgeAllDeviceLocalJournalDrafts: mocks.purgeDrafts,
}));

vi.mock("@/lib/questos/purge", () => ({
  purgePersistedJourney: mocks.purgeJourney,
}));

vi.mock("@/lib/sync/last-user", () => ({
  markLocalJourneyClaimPending: mocks.markClaim,
  markInitialSyncPending: mocks.markInitial,
  setLastSyncedUserId: mocks.setOwner,
}));

vi.mock("@/lib/storage/web-private-cutover", () => ({
  commitWebPrivateHandoffOwner: vi.fn(),
}));

vi.mock("@/lib/platform/target", () => ({
  isNativeTarget: () => true,
}));

import {
  beginAccountLifecycle,
  finishAccountLifecycle,
} from "@/lib/auth/account-lifecycle";
import { prepareLocalJourneyHandoff } from "@/lib/sync/handoff";

beforeEach(() => {
  mocks.purgeJourney.mockReset().mockReturnValue(true);
  mocks.purgeDrafts.mockReset().mockResolvedValue(true);
  mocks.markClaim.mockReset().mockResolvedValue();
  mocks.markInitial.mockReset().mockResolvedValue();
  mocks.setOwner.mockReset().mockResolvedValue();
});

describe("native journey handoff lifecycle", () => {
  it("refuses to stamp a new owner after a timed-out clear releases its lifecycle", async () => {
    let releaseDraftPurge!: (value: boolean) => void;
    mocks.purgeDrafts.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        releaseDraftPurge = resolve;
      }),
    );
    const lifecycle = beginAccountLifecycle("account-b");
    expect(lifecycle).not.toBeNull();

    const handoff = prepareLocalJourneyHandoff(
      "account-b",
      true,
      lifecycle ?? undefined,
    );
    finishAccountLifecycle(lifecycle!);
    releaseDraftPurge(true);

    await expect(handoff).rejects.toThrow("lifecycle changed");
    expect(mocks.markInitial).not.toHaveBeenCalled();
    expect(mocks.setOwner).not.toHaveBeenCalled();
  });
});
