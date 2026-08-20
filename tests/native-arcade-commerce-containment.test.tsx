/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "10000000-0000-4000-8000-000000000001";

vi.mock("@/lib/platform/api", () => ({
  authenticatedApiFetch: vi.fn(),
}));
vi.mock("@/lib/platform/purchases", () => ({
  webCommerceAvailable: vi.fn(),
}));
vi.mock("@/lib/supabase/useSession", () => ({
  useSession: vi.fn(),
}));

import { authenticatedApiFetch } from "@/lib/platform/api";
import { webCommerceAvailable } from "@/lib/platform/purchases";
import { useSession } from "@/lib/supabase/useSession";
import { useArcadeAccess } from "@/lib/games/arcade/useArcadeAccess";

/** Supplies one signed-in account so containment cannot pass by using guest state. */
function signedInSession() {
  vi.mocked(useSession).mockReturnValue({
    user: { id: USER_ID },
    loading: false,
    configured: true,
    recovery: "none",
  } as ReturnType<typeof useSession>);
}

describe("native Arcade commerce containment", () => {
  beforeEach(() => {
    signedInSession();
  });

  it("makes no Arcade commerce request for a signed-in native account", async () => {
    vi.mocked(webCommerceAvailable).mockReturnValue(false);
    const request = vi.mocked(authenticatedApiFetch);
    const { result } = renderHook(() => useArcadeAccess());

    await act(async () => {
      await result.current.refresh();
      await expect(result.current.startCheckout("game-pass")).resolves.toBe(
        false,
      );
      await expect(
        result.current.consumeQuestionSkip("genesis-1"),
      ).resolves.toBe(false);
    });

    expect(request).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      available: false,
      gamePass: false,
      questionSkips: 0,
      loading: false,
      error: null,
    });
  });

  it("keeps the existing Arcade status, checkout, and consume calls on web", async () => {
    vi.mocked(webCommerceAvailable).mockReturnValue(true);
    const request = vi.mocked(authenticatedApiFetch).mockImplementation(
      async (_userId, path) => {
        if (path === "/api/arcade/status") {
          return Response.json({
            available: true,
            gamePass: false,
            questionSkips: 2,
          });
        }
        if (path === "/api/arcade/consume") {
          return Response.json({ consumed: true, remaining: 1 });
        }
        return new Response(null, { status: 503 });
      },
    );
    const { result } = renderHook(() => useArcadeAccess());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questionSkips).toBe(2);

    await act(async () => {
      await expect(result.current.startCheckout("game-pass")).resolves.toBe(
        false,
      );
      await expect(
        result.current.consumeQuestionSkip("genesis-1"),
      ).resolves.toBe(true);
    });

    const paths = request.mock.calls.map(([, path]) => path);
    expect(paths).toContain("/api/arcade/status");
    expect(paths.filter((path) => path === "/api/arcade/checkout")).toHaveLength(
      1,
    );
    expect(paths.filter((path) => path === "/api/arcade/consume")).toHaveLength(
      1,
    );
    expect(result.current.questionSkips).toBe(1);
  });
});
