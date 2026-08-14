import { beforeEach, describe, expect, it, vi } from "vitest";
import { appearanceBootstrapScript } from "@/lib/appearance/bootstrap";
import {
  LEGACY_QUEST_JOURNEY_STORAGE_KEY,
  WEB_V2_QUEST_JOURNEY_STORAGE_KEY,
} from "@/lib/storage/web-private-namespace";

const toggled = new Map<string, boolean>();

/** Installs the small DOM surface used by the pre-hydration inline script. */
function installBootstrapDom() {
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        toggle: (name: string, enabled: boolean) => toggled.set(name, enabled),
      },
      style: {
        colorScheme: "",
        setProperty: vi.fn(),
      },
    },
  });
  Object.assign(window, {
    matchMedia: () => ({ matches: false }),
  });
}

/** Executes only the fixed repository-owned bootstrap for one build target. */
function runBootstrap(nativeTarget = false) {
  Function(appearanceBootstrapScript(nativeTarget))();
}

/** Creates the persisted subset consumed before React hydration. */
function journey(theme: string) {
  return JSON.stringify({
    state: {
      settings: {
        appearance: { theme },
      },
    },
  });
}

describe("appearance bootstrap private namespace", () => {
  beforeEach(() => {
    toggled.clear();
    installBootstrapDom();
  });

  it("never reads a committed account journey before web auth", () => {
    window.localStorage.setItem(WEB_V2_QUEST_JOURNEY_STORAGE_KEY, journey("dark"));

    runBootstrap();

    expect(toggled.size).toBe(0);
  });

  it("never reads a legacy journey before the web guest gate", () => {
    window.localStorage.setItem(
      LEGACY_QUEST_JOURNEY_STORAGE_KEY,
      journey("dark"),
    );

    runBootstrap();

    expect(toggled.size).toBe(0);
  });

  it("keeps the native pre-paint appearance path on legacy storage", () => {
    window.localStorage.setItem(
      LEGACY_QUEST_JOURNEY_STORAGE_KEY,
      journey("dark"),
    );

    runBootstrap(true);

    expect(toggled.get("theme-dark")).toBe(true);
    expect(toggled.get("theme-plain")).toBe(true);
  });
});
