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

function installDeterministicGlobals() {
  const storage = new MemoryStorage();
  let uuid = 0;
  vi.stubGlobal("localStorage", storage);
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
  vi.stubGlobal("crypto", {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
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
