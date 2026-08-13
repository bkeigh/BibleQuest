import { describe, expect, it, vi } from "vitest";
import { rehydrateNativeRouteState } from "@/lib/native/route-state";

describe("native route state", () => {
  it("rehydrates the persisted journey at a native route boundary", async () => {
    const rehydrate = vi.fn().mockResolvedValue(undefined);

    await rehydrateNativeRouteState(true, rehydrate);

    expect(rehydrate).toHaveBeenCalledOnce();
  });

  it("does not rehydrate for ordinary web route changes", async () => {
    const rehydrate = vi.fn().mockResolvedValue(undefined);

    await rehydrateNativeRouteState(false, rehydrate);

    expect(rehydrate).not.toHaveBeenCalled();
  });

  it("keeps the mounted native store usable when rehydration fails", async () => {
    const rehydrate = vi.fn().mockRejectedValue(new Error("fixture failure"));

    await expect(
      rehydrateNativeRouteState(true, rehydrate),
    ).resolves.toBeUndefined();
  });
});
