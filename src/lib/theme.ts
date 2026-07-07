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
