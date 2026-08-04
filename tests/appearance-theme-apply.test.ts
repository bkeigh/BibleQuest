import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyAppearance, watchSystemTheme } from "@/lib/appearance/theme";
import { glassOpacityVariables } from "@/lib/appearance/glass-opacity";
import { DEFAULT_SETTINGS, type AppearanceSettings } from "@/lib/questos/types";

interface FakeRoot {
  classes: Set<string>;
  classList: { toggle: (name: string, force: boolean) => void };
  style: Record<string, string> & { setProperty: (k: string, v: string) => void };
}

function fakeRoot(): FakeRoot {
  const classes = new Set<string>();
  const properties: Record<string, string> = {};
  return {
    classes,
    classList: {
      toggle(name: string, force: boolean) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    style: Object.assign(properties, {
      setProperty(key: string, value: string) {
        properties[key] = value;
      },
    }) as FakeRoot["style"],
  };
}

interface FakeMedia {
  matches: boolean;
  listeners: Set<() => void>;
  emit: () => void;
}

function installDom(prefersDark: boolean): { root: FakeRoot; media: FakeMedia } {
  const root = fakeRoot();
  const listeners = new Set<() => void>();
  const media: FakeMedia = {
    matches: prefersDark,
    listeners,
    emit: () => listeners.forEach((listener) => listener()),
  };
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("window", {
    matchMedia: vi.fn(() => ({
      matches: media.matches,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    })),
  });
  return { root, media };
}

function appearance(
  overrides: Partial<AppearanceSettings> = {},
): AppearanceSettings {
  return { ...DEFAULT_SETTINGS.appearance, ...overrides };
}

describe("applyAppearance", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when there is no document (server render)", () => {
    vi.stubGlobal("document", undefined);
    expect(() => applyAppearance(appearance())).not.toThrow();
  });

  it("keeps paper light and parchment", () => {
    const { root } = installDom(true);
    applyAppearance(appearance({ theme: "paper" }));
    expect(root.classes.has("theme-dark")).toBe(false);
    expect(root.classes.has("theme-plain")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });

  it("maps each theme to the dark and plain switches", () => {
    const cases: [AppearanceSettings["theme"], boolean, boolean][] = [
      ["candlelight", true, false],
      ["light", false, true],
      ["dark", true, true],
    ];
    for (const [theme, dark, plain] of cases) {
      const { root } = installDom(false);
      applyAppearance(appearance({ theme }));
      expect([theme, root.classes.has("theme-dark")]).toEqual([theme, dark]);
      expect([theme, root.classes.has("theme-plain")]).toEqual([theme, plain]);
      expect(root.style.colorScheme).toBe(dark ? "dark" : "light");
    }
  });

  it("follows the OS between parchment day and candlelight for the system theme", () => {
    const dark = installDom(true);
    applyAppearance(appearance({ theme: "system" }));
    expect(dark.root.classes.has("theme-dark")).toBe(true);
    expect(dark.root.classes.has("theme-plain")).toBe(false);

    const light = installDom(false);
    applyAppearance(appearance({ theme: "system" }));
    expect(light.root.classes.has("theme-dark")).toBe(false);
  });

  it("toggles the accessibility and surface classes both ways", () => {
    const { root } = installDom(false);
    applyAppearance(
      appearance({
        textSize: "large",
        boldText: true,
        reducedMotion: true,
        glassSurfaces: true,
      }),
    );
    expect([...root.classes].sort()).toEqual([
      "force-reduce-motion",
      "glass-surfaces",
      "text-bold",
      "text-large",
    ]);

    applyAppearance(appearance({ textSize: "default", glassSurfaces: false }));
    expect([...root.classes]).toEqual([]);
  });

  it("treats legacy appearance objects missing the newer flags as off", () => {
    const { root } = installDom(false);
    const legacy = { ...appearance() } as Partial<AppearanceSettings>;
    delete legacy.boldText;
    delete legacy.glassSurfaces;
    applyAppearance(legacy as AppearanceSettings);
    expect(root.classes.has("text-bold")).toBe(false);
    expect(root.classes.has("glass-surfaces")).toBe(false);
  });

  it("writes the normalized glass opacity variables", () => {
    const { root } = installDom(false);
    applyAppearance(appearance({ glassOpacity: 0 }));
    for (const [property, value] of Object.entries(glassOpacityVariables(0))) {
      expect(root.style[property]).toBe(value);
    }
    expect(root.style["--glass-surface-opacity"]).toBe("15%");
  });
});

describe("watchSystemTheme", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-applies the appearance when the OS scheme changes", () => {
    const { root, media } = installDom(false);
    const stop = watchSystemTheme(appearance({ theme: "system" }));
    expect(root.classes.has("theme-dark")).toBe(false);

    media.matches = true;
    media.emit();
    expect(root.classes.has("theme-dark")).toBe(true);

    stop();
    media.matches = false;
    media.emit();
    expect(root.classes.has("theme-dark")).toBe(true);
    expect(media.listeners.size).toBe(0);
  });

  it("no-ops for an explicit theme or on the server", () => {
    const { media } = installDom(false);
    expect(() => watchSystemTheme(appearance({ theme: "dark" }))()).not.toThrow();
    expect(media.listeners.size).toBe(0);

    vi.stubGlobal("window", undefined);
    expect(() =>
      watchSystemTheme(appearance({ theme: "system" }))(),
    ).not.toThrow();
  });
});
