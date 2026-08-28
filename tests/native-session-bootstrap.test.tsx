// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";

const USER_ID = "10000000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  authCallback: null as null | ((event: string, session: Session | null) => void),
  authUnsubscribe: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  ownDeletionPending: vi.fn(),
}));

/** Builds one complete cached native session without using real credentials. */
function fixtureSession(): Session {
  const user: User = {
    id: USER_ID,
    email: "fixture@example.com",
    aud: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-08-27T12:00:00.000Z",
  };
  return {
    access_token: "fixture-access-token",
    refresh_token: "fixture-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
}

vi.mock("@/lib/sync/availability", () => ({
  useAccountAvailability: () => ({ available: true, loading: false }),
}));

vi.mock("@/lib/sync/containment", () => ({
  accountSyncAvailable: (configured: boolean) => configured,
}));

vi.mock("@/lib/platform/target", () => ({ isNativeTarget: () => true }));
vi.mock("@/lib/analytics/events", () => ({ track: vi.fn() }));
vi.mock("@/lib/observability/client-signals", () => ({
  classifyOperationalError: () => "unknown",
  reportClientSignal: vi.fn(),
}));
vi.mock("@/lib/auth/account-deletion", () => ({
  deleteAccountAndDeviceData: vi.fn(),
  ownAccountDeletionIsPending: mocks.ownDeletionPending,
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
      getSession: mocks.getSession,
      getUser: mocks.getUser,
      onAuthStateChange: (
        callback: (event: string, session: Session | null) => void,
      ) => {
        mocks.authCallback = callback;
        return {
          data: { subscription: { unsubscribe: mocks.authUnsubscribe } },
        };
      },
      signOut: vi.fn(async () => ({ error: null })),
    },
  }),
  isSupabaseConfigured: () => true,
  resumeExistingNativeAuthClient: vi.fn(),
  suspendExistingNativeAuthClient: vi.fn(),
}));
vi.mock("@/lib/supabase/web-auth-storage", () => ({}));
vi.mock("@/lib/sync/last-user", () => ({
  readLocalJourneyOwner: () => ({ status: "unowned" }),
}));
vi.mock("@/lib/storage/web-private-namespace", () => ({
  readWebPrivateGuestClearState: () => "none",
  readWebPrivateNamespaceState: () => "v2",
}));

import { useSession } from "@/lib/supabase/useSession";

/** Exposes only content-free state needed to pin the loader regression. */
function SessionProbe() {
  const session = useSession();
  return (
    <p data-testid="session">
      {session.loading ? "loading" : "ready"}:{session.recovery}:
      {session.user?.id ?? "none"}
    </p>
  );
}

beforeEach(() => {
  const session = fixtureSession();
  mocks.authCallback = null;
  mocks.authUnsubscribe.mockReset();
  mocks.getSession.mockReset().mockResolvedValue({
    data: { session },
    error: null,
  });
  mocks.getUser.mockReset().mockResolvedValue({
    data: { user: session.user },
    error: null,
  });
  mocks.ownDeletionPending.mockReset().mockResolvedValue(false);
});

afterEach(async () => {
  cleanup();
  await Promise.resolve();
  await Promise.resolve();
});

describe("native session bootstrap", () => {
  it("restores Keychain without an auth event and bounds a retryable failure", async () => {
    const first = render(<SessionProbe />);

    // No callback is fired: this recreates the lifecycle-restart event race.
    await waitFor(() => {
      expect(screen.getByTestId("session").textContent).toBe(
        `ready:none:${USER_ID}`,
      );
    });
    expect(mocks.authCallback).not.toBeNull();
    expect(mocks.getSession).toHaveBeenCalledTimes(3);

    first.unmount();
    await waitFor(() => expect(mocks.authUnsubscribe).toHaveBeenCalledOnce());

    // A server outage remains fail-closed but becomes a retry surface, not a
    // permanent loading veil over the app.
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 503, code: "temporarily_unavailable" },
    });
    render(<SessionProbe />);
    await waitFor(() => {
      expect(screen.getByTestId("session").textContent).toBe(
        "ready:session-unavailable:none",
      );
    });
  });
});
