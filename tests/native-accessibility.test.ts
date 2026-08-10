import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizePreferredTextZoom,
  syncNativePreferredTextZoom,
} from "@/lib/native/accessibility";
import {
  statusBarStyleForTheme,
  syncNativeStatusBar,
} from "@/lib/native/status-bar";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";

afterEach(() => {
  delete process.env[PLATFORM];
});

describe("native accessibility bridge", () => {
  it("preserves valid Dynamic Type scales and bounds invalid extremes", () => {
    expect(normalizePreferredTextZoom(1.35)).toBe(1.35);
    expect(normalizePreferredTextZoom(9)).toBe(3.5);
    expect(normalizePreferredTextZoom(0.1)).toBe(0.5);
    expect(normalizePreferredTextZoom(Number.NaN)).toBe(1);
  });

  it("applies the preferred iOS scale through the injected adapter", async () => {
    process.env[PLATFORM] = "native";
    const set = vi.fn().mockResolvedValue(undefined);

    const value = await syncNativePreferredTextZoom({
      getPreferred: vi.fn().mockResolvedValue({ value: 1.7 }),
      set,
    });

    expect(value).toBe(1.7);
    expect(set).toHaveBeenCalledWith({ value: 1.7 });
  });

  it("does not touch a native adapter in a web build", async () => {
    process.env[PLATFORM] = "web";
    const set = vi.fn();

    expect(
      await syncNativePreferredTextZoom({
        getPreferred: vi.fn(),
        set,
      }),
    ).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });
});

describe("native status bar", () => {
  it("chooses contrasting foreground styles for both palettes", () => {
    expect(statusBarStyleForTheme(true)).toBe("DARK");
    expect(statusBarStyleForTheme(false)).toBe("LIGHT");
  });

  it("updates native chrome without running in web builds", async () => {
    const setStyle = vi.fn().mockResolvedValue(undefined);
    process.env[PLATFORM] = "native";
    await syncNativeStatusBar(true, { setStyle });
    expect(setStyle).toHaveBeenCalledWith({ style: "DARK" });

    process.env[PLATFORM] = "web";
    await syncNativeStatusBar(false, { setStyle });
    expect(setStyle).toHaveBeenCalledOnce();
  });
});
