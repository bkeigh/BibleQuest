// @vitest-environment jsdom

import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

type ActiveListener = {
  active: boolean;
  listener: () => void;
};

const mocks = vi.hoisted(() => ({
  adoptGuest: vi.fn(),
  authSubscribe: vi.fn(),
  authUnsubscribe: vi.fn(),
  genuineEmpty: vi.fn(),
  migrateLegacy: vi.fn(),
  ownerStatus: "unowned" as "owned" | "unowned",
  readAuthState: vi.fn(),
  requireRealm: vi.fn(),
  storageListeners: [] as ActiveListener[],
  storageSubscribe: vi.fn(),
  storageUnsubscribe: vi.fn(),
  withAccountLock: vi.fn(),
}));

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
  createClient: () => ({ auth: { onAuthStateChange: mocks.authSubscribe } }),
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
  subscribeWebAuthStorageChanges: mocks.storageSubscribe,
  verifyRetainedWebAuthSession: vi.fn(),
  webAuthStorageIsGenuinelyEmpty: mocks.genuineEmpty,
  withNeverOwnedWebPrivateGuestProvenance: vi.fn(),
  withTerminalWebPrivateWriteCleanup: vi.fn(),
  withWebPrivateLegacyAbsenceAudit: vi.fn(),
  withWebAccountOperationLock: mocks.withAccountLock,
}));

vi.mock("@/lib/sync/last-user", () => ({
  readLocalJourneyOwner: () =>
    mocks.ownerStatus === "unowned"
      ? { status: "unowned" }
      : {
          status: "owned",
          userId: "10000000-0000-4000-8000-000000000001",
        },
}));

vi.mock("@/lib/storage/web-private-namespace", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/storage/web-private-namespace")
  >()),
  readWebPrivateGuestClearState: () => "none",
  readWebPrivateNamespaceState: () => "legacy",
}));

import { useSession } from "@/lib/supabase/useSession";

/** Displays the shared fields changed by a guest storage reconciliation. */
function SessionProbe({ id }: { id: string }) {
  const session = useSession();
  return (
    <p data-testid={id}>
      {session.loading ? "loading" : "ready"}:{session.recovery}
    </p>
  );
}

/** Mounts the same hook through two independent production-style consumers. */
function Consumers({ first = true }: { first?: boolean }) {
  return (
    <StrictMode>
      {first ? <SessionProbe id="first" /> : null}
      <SessionProbe id="second" />
    </StrictMode>
  );
}

beforeEach(() => {
  mocks.adoptGuest.mockReset().mockResolvedValue(true);
  mocks.authSubscribe.mockReset().mockImplementation(() => ({
    data: {
      subscription: {
        unsubscribe: mocks.authUnsubscribe,
      },
    },
  }));
  mocks.authUnsubscribe.mockReset();
  mocks.genuineEmpty.mockReset().mockReturnValue(true);
  mocks.migrateLegacy.mockReset().mockResolvedValue("empty");
  mocks.ownerStatus = "unowned";
  mocks.readAuthState.mockReset().mockResolvedValue({ status: "missing" });
  mocks.requireRealm.mockReset().mockResolvedValue(undefined);
  mocks.storageListeners.length = 0;
  mocks.storageSubscribe
    .mockReset()
    .mockImplementation((listener: () => void) => {
      const entry = { active: true, listener };
      mocks.storageListeners.push(entry);
      return () => {
        entry.active = false;
        mocks.storageUnsubscribe();
      };
    });
  mocks.storageUnsubscribe.mockReset();
  mocks.withAccountLock.mockReset().mockImplementation(
    async (run: (handle: object) => unknown) => run({}),
  );
});

afterEach(() => {
  cleanup();
});

describe("shared useSession runtime", () => {
  it("owns one bootstrap until the last mounted consumer leaves", async () => {
    const view = render(<Consumers />);

    await waitFor(() => {
      expect(screen.getByTestId("first").textContent).toBe("ready:none");
      expect(screen.getByTestId("second").textContent).toBe("ready:none");
    });
    expect(mocks.authSubscribe).toHaveBeenCalledOnce();
    expect(mocks.storageSubscribe).toHaveBeenCalledOnce();
    expect(mocks.withAccountLock).toHaveBeenCalledOnce();

    // One storage signal changes the singleton snapshot for both consumers.
    mocks.ownerStatus = "owned";
    const activeStorage = mocks.storageListeners.findLast(
      (entry) => entry.active,
    );
    expect(activeStorage).toBeDefined();
    act(() => activeStorage?.listener());
    await waitFor(() => {
      expect(screen.getByTestId("first").textContent).toBe(
        "ready:locked-local-journey",
      );
      expect(screen.getByTestId("second").textContent).toBe(
        "ready:locked-local-journey",
      );
    });
    expect(mocks.withAccountLock).toHaveBeenCalledTimes(2);

    // Removing one consumer keeps the shared auth owner alive.
    view.rerender(<Consumers first={false} />);
    expect(mocks.authUnsubscribe).not.toHaveBeenCalled();
    expect(mocks.storageUnsubscribe).not.toHaveBeenCalled();

    // A same-turn remount models Strict Mode's temporary zero-consumer pass.
    view.unmount();
    const remounted = render(<Consumers first={false} />);
    expect(mocks.authSubscribe).toHaveBeenCalledOnce();
    expect(mocks.storageSubscribe).toHaveBeenCalledOnce();
    expect(mocks.authUnsubscribe).not.toHaveBeenCalled();
    expect(mocks.storageUnsubscribe).not.toHaveBeenCalled();

    // The real last unmount performs exactly one deferred cleanup.
    remounted.unmount();
    await waitFor(() => {
      expect(mocks.authUnsubscribe).toHaveBeenCalledOnce();
      expect(mocks.storageUnsubscribe).toHaveBeenCalledOnce();
    });
  });
});
