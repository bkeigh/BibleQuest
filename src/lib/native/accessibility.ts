/** Bridges iOS Dynamic Type into the WebView without changing web behavior. */
import { isNativeTarget } from "@/lib/platform/target";

interface TextZoomAdapter {
  getPreferred: () => Promise<{ value: number }>;
  set: (options: { value: number }) => Promise<void>;
}

export const MAX_NATIVE_TEXT_ZOOM = 2;

/** Separates Apple's standard XXXL scale from accessibility categories. */
export const NATIVE_ACCESSIBILITY_TEXT_ZOOM_THRESHOLD = 1.5;

/** Lets SceneDelegate request a fresh TextZoom reading without reloading. */
export const NATIVE_TEXT_SIZE_CHANGE_EVENT =
  "biblequest:native-text-size-change";

/**
 * Preserves WCAG's full 200% text enlargement without letting WebKit apply
 * iOS's 3.1x body multiplier to fixed tab-bar and card geometry. Native code
 * separately marks accessibility categories so those layouts can reflow.
 */
export function normalizePreferredTextZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_NATIVE_TEXT_ZOOM, Math.max(0.5, value));
}

/** Applies iOS text sizing; the app's explicit Large setting layers on top. */
export async function syncNativePreferredTextZoom(
  adapter?: TextZoomAdapter,
  requestedValue?: number,
): Promise<number | null> {
  if (!isNativeTarget()) return null;
  let textZoom = adapter;
  if (!textZoom) {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    textZoom = (await import("@capacitor/text-zoom")).TextZoom;
  }
  const requested = requestedValue ?? (await textZoom.getPreferred()).value;
  const preferred = normalizePreferredTextZoom(requested);
  await textZoom.set({ value: preferred });
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle(
      "system-accessibility-text",
      Number.isFinite(requested) &&
        requested >= NATIVE_ACCESSIBILITY_TEXT_ZOOM_THRESHOLD,
    );
    // Fixed navigation can cancel only the applied scale while page content
    // continues to receive the full, bounded Dynamic Type enlargement.
    root.style.setProperty(
      "--native-text-zoom-inverse",
      String(1 / preferred),
    );
  }
  return preferred;
}
