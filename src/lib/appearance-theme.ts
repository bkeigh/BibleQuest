/**
 * The four themes, and the two independent things a theme decides.
 *
 * BibleQuest's own look is parchment — warm ivory, a hairline mist border, and
 * the Ithaca pixel face on short labels. Paper and Candlelight are that look in
 * daylight and by candle, and they stay the default. Light and Dark are the
 * plain white and near-black that some readers simply prefer; they keep every
 * layout, spacing and accent decision and change only the palette and the
 * pixel face.
 *
 * A theme therefore resolves to two independent switches rather than one name:
 *
 *   dark   — is the canvas dark? (Candlelight and Dark)
 *   plain  — is the palette neutral rather than parchment? (Light and Dark)
 *
 * Keeping `dark` separate is what lets every existing `html.theme-dark` rule in
 * globals.css go on working untouched; `plain` is a palette layer on top.
 */
export const THEME_IDS = ["paper", "candlelight", "light", "dark", "system"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export interface ResolvedTheme {
  dark: boolean;
  plain: boolean;
}

export interface ThemeChoice {
  id: Exclude<ThemeId, "system">;
  label: string;
  /** What a reader is actually choosing, in their terms. */
  hint: string;
}

export const THEME_CHOICES: ThemeChoice[] = [
  { id: "paper", label: "Paper", hint: "Warm parchment. BibleQuest's own." },
  { id: "candlelight", label: "Candlelight", hint: "Parchment by candle." },
  { id: "light", label: "Light", hint: "Plain white." },
  { id: "dark", label: "Dark", hint: "Plain near-black." },
];

/**
 * Resolves a stored theme to the two switches.
 *
 * `system` follows the OS between Paper and Candlelight rather than between
 * Light and Dark, because the parchment pair is the app's own look and a reader
 * who never opened the setting should meet that one.
 */
export function resolveTheme(theme: string, prefersDark: boolean): ResolvedTheme {
  switch (theme) {
    case "candlelight":
      return { dark: true, plain: false };
    case "light":
      return { dark: false, plain: true };
    case "dark":
      return { dark: true, plain: true };
    case "system":
      return { dark: prefersDark, plain: false };
    case "paper":
    default:
      return { dark: false, plain: false };
  }
}

/**
 * Renames the two pre-existing values onto the four-theme scale.
 *
 * `light` and `dark` used to mean parchment-by-day and parchment-by-candle, and
 * those names now belong to the plain themes. Migrating rather than reusing
 * them is what keeps a reader's canvas exactly as they left it instead of
 * silently swapping parchment for white.
 */
export function migrateLegacyTheme(theme: unknown): ThemeId {
  if (theme === "light") return "paper";
  if (theme === "dark") return "candlelight";
  return THEME_IDS.includes(theme as ThemeId) ? (theme as ThemeId) : "paper";
}
