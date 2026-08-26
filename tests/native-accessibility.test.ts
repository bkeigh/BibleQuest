// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_NATIVE_TEXT_ZOOM,
  NATIVE_ACCESSIBILITY_TEXT_ZOOM_THRESHOLD,
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
  document.documentElement.classList.remove("system-accessibility-text");
  document.documentElement.style.removeProperty(
    "--native-text-zoom-inverse",
  );
});

describe("native accessibility bridge", () => {
  it("preserves readable Dynamic Type scales and caps fixed-layout zoom", () => {
    expect(normalizePreferredTextZoom(1.35)).toBe(1.35);
    expect(normalizePreferredTextZoom(3.1)).toBe(MAX_NATIVE_TEXT_ZOOM);
    expect(normalizePreferredTextZoom(9)).toBe(MAX_NATIVE_TEXT_ZOOM);
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
    expect(
      document.documentElement.classList.contains(
        "system-accessibility-text",
      ),
    ).toBe(true);
    expect(
      document.documentElement.style.getPropertyValue(
        "--native-text-zoom-inverse",
      ),
    ).toBe(String(1 / 1.7));
  });

  it("keeps standard Dynamic Type out of accessibility-only layouts", async () => {
    process.env[PLATFORM] = "native";
    const requested = NATIVE_ACCESSIBILITY_TEXT_ZOOM_THRESHOLD - 0.01;

    await syncNativePreferredTextZoom({
      getPreferred: vi.fn().mockResolvedValue({ value: requested }),
      set: vi.fn().mockResolvedValue(undefined),
    });

    expect(
      document.documentElement.classList.contains(
        "system-accessibility-text",
      ),
    ).toBe(false);
  });

  it("uses an uncached native notification scale for live changes", async () => {
    process.env[PLATFORM] = "native";
    const getPreferred = vi.fn();
    const set = vi.fn().mockResolvedValue(undefined);

    const value = await syncNativePreferredTextZoom(
      { getPreferred, set },
      3.1,
    );

    expect(value).toBe(MAX_NATIVE_TEXT_ZOOM);
    expect(getPreferred).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ value: MAX_NATIVE_TEXT_ZOOM });
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
