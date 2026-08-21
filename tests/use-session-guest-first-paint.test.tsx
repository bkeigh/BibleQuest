// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  adoptGuest: vi.fn(),
  authUnsubscribe: vi.fn(),
  genuineEmpty: vi.fn(),
  migrateLegacy: vi.fn(),
  readAuthState: vi.fn(),
  requireRealm: vi.fn(),
  storageUnsubscribe: vi.fn(),
  withAccountLock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/onboarding" }));

vi.mock("@/lib/sync/availability", () => ({
  useAccountAvailability: () => ({ available: true, loading: false }),
}));

vi.mock("@/lib/sync/containment", () => ({
  accountSyncAvailable: (configured: boolean) => configured,
}));

vi.mock("@/lib/platform/target", () => ({ isNativeTarget: () => false }));

vi.mock("@/lib/analytics/events", () => ({ track: vi.fn() }));

vi.mock("@/lib/observability/client-signals", () => ({
  classifyOperationalError: () => "unknown",
  reportClientSignal: vi.fn(),
}));

vi.mock("@/lib/auth/account-lifecycle", () => ({
  accountLifecycleHandleIsCurrent: () => true,
  accountLifecycleIsActive: () => false,
  accountLifecycleSnapshot: () => 0,
  beginAccountLifecycle: vi.fn(),
  finishAccountLifecycle: vi.fn(),
  subscribeAccountLifecycle: () => () => undefined,
}));

vi.mock("@/lib/auth/account-deletion", () => ({
  deleteAccountAndDeviceData: vi.fn(),
  ownAccountDeletionIsPending: vi.fn(),
}));

vi.mock("@/lib/auth/account-sign-out", () => ({
  prepareMarkedWebAccountSignOut: vi.fn(),
  resumeMarkedWebAccountSignOut: vi.fn(),
}));

vi.mock("@/lib/auth/device-account-cleanup", () => ({
  purgeDeletedAccountDeviceData: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: mocks.authUnsubscribe } },
      })),
    },
  }),
  isSupabaseConfigured: () => true,
  resumeExistingNativeAuthClient: vi.fn(),
  suspendExistingNativeAuthClient: vi.fn(),
}));

vi.mock("@/lib/supabase/web-auth-storage", () => ({
  adoptCurrentWebPrivateWriteGeneration: mocks.adoptGuest,
  clearExactWebAuthSession: vi.fn(),
  clearRevokedWebAuthSubject: vi.fn(),
  markWebAccountDeleting: vi.fn(),
  migrateLegacyWebSession: mocks.migrateLegacy,
  readWebAuthState: mocks.readAuthState,
  refreshRetainedDeletingWebSession: vi.fn(),
  requireCurrentWebAccountRealm: mocks.requireRealm,
  resumeInstallingWebSession: vi.fn(),
  subscribeWebAuthStorageChanges: vi.fn(() => mocks.storageUnsubscribe),
  verifyRetainedWebAuthSession: vi.fn(),
  webAuthStorageIsGenuinelyEmpty: mocks.genuineEmpty,
  withNeverOwnedWebPrivateGuestProvenance: vi.fn(),
  withTerminalWebPrivateWriteCleanup: vi.fn(),
  withWebPrivateLegacyAbsenceAudit: vi.fn(),
  withWebAccountOperationLock: mocks.withAccountLock,
}));

vi.mock("@/lib/sync/last-user", () => ({
  readLocalJourneyOwner: () => ({ status: "unowned" }),
}));

vi.mock("@/lib/storage/web-private-namespace", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/storage/web-private-namespace")
  >()),
  readWebPrivateGuestClearState: () => "none",
  readWebPrivateNamespaceState: () => "legacy",
}));

import { useSession } from "@/lib/supabase/useSession";

/** Shows only the state that controls the onboarding first-paint veil. */
function SessionProbe() {
  const session = useSession();
  return <p>{session.loading ? "loading" : "ready"}</p>;
}

beforeEach(() => {
  mocks.adoptGuest.mockReset().mockResolvedValue(true);
  mocks.authUnsubscribe.mockReset();
  mocks.genuineEmpty.mockReset().mockReturnValue(true);
  mocks.migrateLegacy.mockReset().mockResolvedValue("empty");
  mocks.readAuthState.mockReset().mockResolvedValue({ status: "missing" });
  mocks.requireRealm.mockReset().mockResolvedValue(undefined);
  mocks.storageUnsubscribe.mockReset();
  mocks.withAccountLock.mockReset().mockImplementation(
    async (run: (handle: object) => unknown) => run({}),
  );
});

afterEach(() => {
  cleanup();
});

describe("guest session first paint", () => {
  it("opens a genuinely empty guest without worker attestation or migration", async () => {
    render(<SessionProbe />);

    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    expect(mocks.requireRealm).not.toHaveBeenCalled();
    expect(mocks.migrateLegacy).not.toHaveBeenCalled();
    expect(mocks.adoptGuest).toHaveBeenCalledOnce();
  });

  it("keeps attested migration when legacy credential absence is not proved", async () => {
    mocks.genuineEmpty.mockReturnValue(false);

    render(<SessionProbe />);

    await waitFor(() => expect(screen.getByText("ready")).toBeTruthy());
    expect(mocks.requireRealm).toHaveBeenCalledOnce();
    expect(mocks.migrateLegacy).toHaveBeenCalledOnce();
  });
});
