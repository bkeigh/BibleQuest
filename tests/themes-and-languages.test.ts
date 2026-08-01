import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  THEME_CHOICES,
  THEME_IDS,
  migrateLegacyTheme,
  resolveTheme,
} from "@/lib/appearance/themes";
import { LANGUAGES } from "@/lib/i18n/languages";
import { en } from "@/lib/i18n/en";
import { DEFAULT_SETTINGS } from "@/lib/questos/types";

const css = readFileSync("src/app/globals.css", "utf8");
const bootstrap = readFileSync("src/lib/appearance/bootstrap.ts", "utf8");
const store = readFileSync("src/lib/questos/store.ts", "utf8");
const onboarding = readFileSync(
  "src/components/onboarding/OnboardingFlow.tsx",
  "utf8",
);

describe("the four themes", () => {
  it("resolves each one to a canvas and a palette", () => {
    expect(resolveTheme("paper", false)).toEqual({ dark: false, plain: false });
    expect(resolveTheme("candlelight", false)).toEqual({ dark: true, plain: false });
    expect(resolveTheme("light", false)).toEqual({ dark: false, plain: true });
    expect(resolveTheme("dark", false)).toEqual({ dark: true, plain: true });
  });

  it("follows the OS between the parchment pair, not the plain one", () => {
    // A reader who never opened the setting should meet BibleQuest's own look
    // in both directions, rather than plain white because their phone is light.
    expect(resolveTheme("system", false)).toEqual({ dark: false, plain: false });
    expect(resolveTheme("system", true)).toEqual({ dark: true, plain: false });
  });

  it("renames the two old values instead of reusing them", () => {
    // "light" and "dark" used to mean parchment by day and parchment by
    // candle. Those names now belong to the plain themes, so a stored value
    // has to move or every existing reader opens the app to a canvas they
    // never chose.
    expect(migrateLegacyTheme("light")).toBe("paper");
    expect(migrateLegacyTheme("dark")).toBe("candlelight");
    expect(migrateLegacyTheme("system")).toBe("system");
    expect(migrateLegacyTheme("paper")).toBe("paper");
    for (const junk of [undefined, null, "", "sepia", 7]) {
      expect(migrateLegacyTheme(junk)).toBe("paper");
    }
  });

  it("ships the migration that performs that rename", () => {
    expect(store).toContain("if (version < 18)");
    expect(store).toContain("migrateLegacyTheme");
  });

  it("keeps parchment the default", () => {
    expect(DEFAULT_SETTINGS.appearance.theme).toBe("paper");
  });

  it("offers exactly the four, and names them all", () => {
    expect(THEME_CHOICES.map((choice) => choice.id)).toEqual([
      "paper",
      "candlelight",
      "light",
      "dark",
    ]);
    expect(THEME_IDS).toContain("system");
    for (const key of ["themePaper", "themeDark", "themeLight", "themePlainDark"] as const) {
      expect(en.settings[key], `${key} has no English name`).toBeTruthy();
    }
  });

  it("gives the plain themes their own palette and drops the pixel face", () => {
    expect(css).toContain("html.theme-plain {");
    expect(css).toContain("html.theme-dark.theme-plain {");
    // The pixel face is part of the parchment look; a plain theme hands its
    // short labels to the display face, exactly as the RTL locales already do.
    const swap = css.indexOf("html.theme-plain .font-pixel");
    expect(swap).toBeGreaterThan(-1);
    expect(css.slice(swap, css.indexOf("}", swap))).toContain("--font-display");
  });

  it("agrees between first paint and hydration", () => {
    // The bootstrap is inlined into <head> and cannot import, so the two
    // implementations are held together here rather than by the module system.
    expect(bootstrap).toContain('"theme-plain"');
    expect(bootstrap).toContain('theme === "candlelight"');
    expect(bootstrap).toContain('theme === "light" || theme === "dark"');
  });
});

describe("the language step", () => {
  it("gives every language a flag to be recognised by", () => {
    for (const language of LANGUAGES) {
      expect(language.flags.length, `${language.code} has no flag`).toBeGreaterThan(0);
      for (const flag of language.flags) {
        // Regional-indicator pairs, which is what a flag emoji is.
        expect(flag, `${language.code}: ${flag}`).toMatch(/^[\u{1F1E6}-\u{1F1FF}]{2}$/u);
      }
    }
  });

  it("shows both readings of English, as asked", () => {
    const english = LANGUAGES.find((l) => l.code === "en");
    expect(english?.flags).toEqual(["🇺🇸", "🇬🇧"]);
  });

  it("asks before the guide starts, and saves both answers", () => {
    // The point of asking here rather than in Settings is that the very first
    // screen of the app is already in the reader's language.
    expect(onboarding).toContain("const LANGUAGE_STEP = 2");
    expect(onboarding).toContain("preferredBibleTranslation: draft.bibleTranslation");
    expect(onboarding).toContain("language: draft.language");
  });

  it("lets the app and the Bible differ", () => {
    // A reader may want the app in Spanish and the King James in English.
    // Two independent inputs is what makes that expressible.
    expect(onboarding).toContain('name="onboarding-language"');
    expect(onboarding).toContain('name="onboarding-bible"');
  });

  it("does not make the guide wait on an exit animation", () => {
    // `AnimatePresence mode="wait"` holds the next step until the previous one
    // finishes leaving. When that never arrived the guide went blank: the dots
    // advanced, the old step sat at opacity 0, and nothing replaced it.
    // Comments stripped first — the note explaining why it is gone says the
    // name, and a test that cannot tell prose from code would forbid writing
    // down the reason.
    const code = onboarding
      .replaceAll(/\/\*[\s\S]*?\*\//g, "")
      .replaceAll(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("AnimatePresence");
    expect(code).not.toContain('exit="exit"');
  });
});
