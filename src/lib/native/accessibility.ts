/** Bridges iOS Dynamic Type into the WebView without changing web behavior. */
import { isNativeTarget } from "@/lib/platform/target";

interface TextZoomAdapter {
  getPreferred: () => Promise<{ value: number }>;
  set: (options: { value: number }) => Promise<void>;
}

/** Guards the native boundary while preserving accessibility-scale extremes. */
export function normalizePreferredTextZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(3.5, Math.max(0.5, value));
}

/** Applies iOS text sizing; the app's explicit Large setting layers on top. */
export async function syncNativePreferredTextZoom(
  adapter?: TextZoomAdapter,
): Promise<number | null> {
  if (!isNativeTarget()) return null;
  let textZoom = adapter;
  if (!textZoom) {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    textZoom = (await import("@capacitor/text-zoom")).TextZoom;
  }
  const preferred = normalizePreferredTextZoom(
    (await textZoom.getPreferred()).value,
  );
  await textZoom.set({ value: preferred });
  return preferred;
}
