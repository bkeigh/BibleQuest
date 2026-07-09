import type { AppearanceSettings } from "@/lib/questos/types";

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
  const dark = a.theme === "dark" || (a.theme === "system" && prefersDark);

  root.classList.toggle("theme-dark", dark);
  root.classList.toggle("text-large", a.textSize === "large");
  root.classList.toggle("force-reduce-motion", a.reducedMotion);
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
