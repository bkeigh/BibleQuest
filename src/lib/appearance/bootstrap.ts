import {
  DEFAULT_GLASS_OPACITY,
  GLASS_OPACITY_LAYER_OFFSETS,
  MAX_GLASS_OPACITY,
  MIN_GLASS_OPACITY,
} from "./glass-opacity";
import {
  LEGACY_QUEST_JOURNEY_STORAGE_KEY,
} from "@/lib/storage/web-private-namespace";
import { isNativeTarget } from "@/lib/platform/target";

/**
 * Applies persisted appearance classes before React hydrates. The global CSP
 * currently permits the inline scripts Next.js itself requires.
 */
export function appearanceBootstrapScript(nativeTarget: boolean): string {
  return `
(function () {
  try {
    // Web account and guest reads wait for the verified React storage gate.
    // Native has a separate Keychain/backup boundary and may apply its legacy
    // local appearance before the first paint.
    if (!${JSON.stringify(nativeTarget)}) return;
    var raw = window.localStorage.getItem(${JSON.stringify(LEGACY_QUEST_JOURNEY_STORAGE_KEY)});
    if (!raw) return;
    var persisted = JSON.parse(raw);
    var appearance = persisted && persisted.state && persisted.state.settings && persisted.state.settings.appearance;
    if (!appearance) return;
    var root = document.documentElement;
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    // Mirrors resolveTheme() in lib/appearance-theme.ts. This script is inlined
    // into <head> before any bundle loads, so it cannot import — the shapes are
    // held together by a test rather than by the module system.
    var theme = appearance.theme;
    var dark = theme === "candlelight" || theme === "dark" || (theme === "system" && prefersDark);
    var plain = theme === "light" || theme === "dark";
    root.classList.toggle("theme-dark", dark);
    root.classList.toggle("theme-plain", plain);
    root.classList.toggle("text-large", appearance.textSize === "large");
    root.classList.toggle("text-bold", appearance.boldText === true);
    root.classList.toggle("force-reduce-motion", appearance.reducedMotion === true);
    root.classList.toggle("glass-surfaces", appearance.glassSurfaces !== false);
    // Optimistic: a stored Plus wallpaper on a lapsed account resolves to none,
    // and WallpaperBackdrop corrects this once it knows. Guessing "yes" here
    // costs one frame of blur; guessing "no" would flash unblurred cards over
    // a wallpaper on every cold start.
    root.classList.toggle(
      "has-wallpaper",
      !!appearance.wallpaperId && appearance.wallpaperId !== "none",
    );
    // Match the hydrated theme's material hierarchy during the first paint.
    var requestedOpacity = typeof appearance.glassOpacity === "number" && isFinite(appearance.glassOpacity)
      ? appearance.glassOpacity
      : ${DEFAULT_GLASS_OPACITY};
    var glassOpacity = Math.min(${MAX_GLASS_OPACITY}, Math.max(${MIN_GLASS_OPACITY}, Math.round(requestedOpacity)));
    var glassOffsets = ${JSON.stringify(GLASS_OPACITY_LAYER_OFFSETS)};
    var offsetScale = glassOpacity >= ${DEFAULT_GLASS_OPACITY}
      ? (${MAX_GLASS_OPACITY} - glassOpacity) / (${MAX_GLASS_OPACITY} - ${DEFAULT_GLASS_OPACITY})
      : 1;
    Object.keys(glassOffsets).forEach(function (property) {
      var layerOpacity = Math.min(${MAX_GLASS_OPACITY}, Math.max(${MIN_GLASS_OPACITY}, Math.round(glassOpacity + glassOffsets[property] * offsetScale)));
      root.style.setProperty(property, layerOpacity + "%");
    });
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (_) {
    // Storage denial or malformed legacy data should never block first paint.
  }
})();`;
}

/** Uses a build-time target so web never reads private appearance before auth. */
export const APPEARANCE_BOOTSTRAP_SCRIPT = appearanceBootstrapScript(
  isNativeTarget(),
);
