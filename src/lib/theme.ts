import type { AppearanceSettings } from "@/lib/questos/types";
import { glassOpacityVariables } from "@/lib/glass-opacity";
import { resolveTheme } from "@/lib/appearance-theme";

/**
 * Applies appearance settings to <html> via classes that globals.css reacts to.
 * Dark mode reads as candlelight, not a tech OLED black.
 */
export function applyAppearance(a: AppearanceSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const { dark, plain } = resolveTheme(a.theme, prefersDark);

  root.classList.toggle("theme-dark", dark);
  // The palette layer. Every existing `html.theme-dark` rule keeps working;
  // `theme-plain` only swaps parchment for neutral and the pixel face for the
  // display face.
  root.classList.toggle("theme-plain", plain);
  root.classList.toggle("text-large", a.textSize === "large");
  // !! guards pre-v5 persisted appearance objects that lack the field.
  root.classList.toggle("text-bold", !!a.boldText);
  root.classList.toggle("force-reduce-motion", a.reducedMotion);
  // Glass is scoped to app surfaces in globals.css, never marketing or editors.
  root.classList.toggle("glass-surfaces", !!a.glassSurfaces);
  // Normalize at the render boundary so corrupt legacy state can never make
  // a quiet or nested surface more transparent than the readability floor.
  for (const [property, value] of Object.entries(
    glassOpacityVariables(a.glassOpacity),
  )) {
    root.style.setProperty(property, value);
  }
  root.style.colorScheme = dark ? "dark" : "light";
}

/**
 * Watches the OS color scheme and re-applies the appearance when it changes,
 * so theme "system" tracks the OS mid-session instead of going stale.
 * No-ops (and returns a no-op cleanup) unless `a.theme === "system"`.
 *
 * Returns an unsubscribe function — call it when the appearance settings
 * change or the owning component unmounts, then re-invoke with the new
 * settings (e.g. inside ThemeApplier's effect).
 */
export function watchSystemTheme(a: AppearanceSettings): () => void {
  if (typeof window === "undefined" || a.theme !== "system") {
    return () => {};
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyAppearance(a);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
