/**
 * Applies persisted appearance classes before React hydrates. The global CSP
 * currently permits the inline scripts Next.js itself requires.
 */
export const APPEARANCE_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var raw = window.localStorage.getItem("biblequest:v1");
    if (!raw) return;
    var persisted = JSON.parse(raw);
    var appearance = persisted && persisted.state && persisted.state.settings && persisted.state.settings.appearance;
    if (!appearance) return;
    var root = document.documentElement;
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var dark = appearance.theme === "dark" || (appearance.theme === "system" && prefersDark);
    root.classList.toggle("theme-dark", dark);
    root.classList.toggle("text-large", appearance.textSize === "large");
    root.classList.toggle("text-bold", appearance.boldText === true);
    root.classList.toggle("force-reduce-motion", appearance.reducedMotion === true);
    root.classList.toggle("glass-surfaces", appearance.glassSurfaces !== false);
    root.style.colorScheme = dark ? "dark" : "light";
  } catch (_) {
    // Storage denial or malformed legacy data should never block first paint.
  }
})();`;
