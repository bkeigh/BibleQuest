import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, vi } from "vitest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

/**
 * jsdom files get a real Window. Replacing it with the fixture below removes
 * HTMLInputElement and breaks React's event delegation, so a mounted component
 * never sees a change event and no state ever updates — which looks exactly
 * like a broken component rather than a broken harness.
 */
const hasRealDom =
  typeof document !== "undefined" &&
  typeof globalThis.window?.HTMLInputElement === "function";

function installDeterministicGlobals() {
  const storage = new MemoryStorage();
  let uuid = 0;
  vi.stubGlobal("localStorage", storage);
  if (!hasRealDom) {
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      localStorage: storage,
      location: {
        href: "https://biblequest.test/app/journey?fixture=ignored#fixture-ignored",
        origin: "https://biblequest.test",
        pathname: "/app/journey",
        search: "?fixture=ignored",
        hash: "#fixture-ignored",
      },
    });
    vi.stubGlobal("navigator", { doNotTrack: "0", onLine: true });
  }
  vi.stubGlobal("crypto", {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
    subtle: webcrypto.subtle,
  });
}

installDeterministicGlobals();

beforeEach(() => {
  installDeterministicGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
