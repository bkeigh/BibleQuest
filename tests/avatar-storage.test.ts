import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_CHANGED_EVENT,
  clearAvatar,
  purgeAvatarCache,
  clearLegacyAvatar,
  loadAvatar,
  loadLegacyAvatar,
  migrateLegacyAvatar,
  profileAvatarMarker,
  storeRemoteAvatar,
} from "@/lib/utils/avatar";

const MARKER = "11111111-1111-4111-8111-111111111111";
const OTHER_MARKER = "22222222-2222-4222-8222-222222222222";

/**
 * The smallest byte sequence that satisfies the shared avatar validator:
 * a RIFF/WEBP container whose declared size matches its exact length.
 */
function webpBlob(payloadBytes = 8): Blob {
  const bytes = new Uint8Array(12 + payloadBytes);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  const declared = 4 + payloadBytes;
  bytes[4] = declared & 0xff;
  bytes[5] = (declared >> 8) & 0xff;
  bytes[6] = (declared >> 16) & 0xff;
  bytes[7] = (declared >> 24) & 0xff;
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  return new Blob([bytes], { type: "image/webp" });
}

// --- Minimal IndexedDB stand-in -------------------------------------------
// Only the surface avatar.ts touches: open, one object store, get/put/delete/
// clear, and transaction completion.

type Handler = (() => void) | null;

interface FakeRequest {
  result: unknown;
  onsuccess: Handler;
  onerror: Handler;
}

function installIndexedDb(options: { failWrites?: boolean } = {}) {
  const data = new Map<string, unknown>();
  let opened = false;

  const makeDb = () => ({
    objectStoreNames: { contains: () => true },
    close: vi.fn(),
    transaction(_name: string, mode: IDBTransactionMode = "readonly") {
      const transaction: {
        oncomplete: Handler;
        onerror: Handler;
        onabort: Handler;
        objectStore: () => Record<string, (...args: never[]) => FakeRequest>;
      } = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => store,
      };
      const request = (run: () => unknown): FakeRequest => {
        const req: FakeRequest = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          if (mode === "readwrite" && options.failWrites) {
            req.onerror?.();
            transaction.onerror?.();
            return;
          }
          req.result = run();
          req.onsuccess?.();
          transaction.oncomplete?.();
        });
        return req;
      };
      const store = {
        get: ((key: string) => request(() => data.get(key))) as never,
        put: ((value: unknown, key: string) =>
          request(() => data.set(key, value))) as never,
        delete: ((key: string) => request(() => data.delete(key))) as never,
        clear: (() => request(() => data.clear())) as never,
      };
      return transaction as unknown as IDBTransaction;
    },
  });

  vi.stubGlobal("indexedDB", {
    open: () => {
      const req: FakeRequest & { onupgradeneeded: Handler } = {
        result: makeDb(),
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        if (!opened && data.size === 0) req.onupgradeneeded?.();
        opened = true;
        req.onsuccess?.();
      });
      return req;
    },
  });
  return data;
}

function installWindow() {
  const events: { type: string; detail: unknown }[] = [];
  vi.stubGlobal("CustomEvent", class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  });
  vi.stubGlobal("window", {
    dispatchEvent: (event: { type: string; detail: unknown }) => {
      events.push({ type: event.type, detail: event.detail });
      return true;
    },
    localStorage,
  });
  return events;
}

describe("profileAvatarMarker", () => {
  it("prefers the server version over the legacy local timestamp", () => {
    expect(
      profileAvatarMarker({
        avatarVersion: MARKER,
        avatarUpdatedAt: "2026-07-16T12:00:00Z",
      }),
    ).toBe(MARKER);
    expect(
      profileAvatarMarker({
        avatarVersion: null,
        avatarUpdatedAt: "2026-07-16T12:00:00Z",
      }),
    ).toBe("2026-07-16T12:00:00Z");
  });

  it("rejects a missing or unsafe marker", () => {
    expect(profileAvatarMarker(null)).toBeNull();
    expect(profileAvatarMarker(undefined)).toBeNull();
    expect(profileAvatarMarker({})).toBeNull();
    expect(
      profileAvatarMarker({ avatarVersion: "../../etc/passwd" }),
    ).toBeNull();
  });
});

describe("avatar cache without IndexedDB", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", undefined);
  });

  it("degrades to no photo instead of throwing", async () => {
    await expect(loadAvatar(MARKER)).resolves.toBeNull();
    await expect(loadLegacyAvatar()).resolves.toBeNull();
    await expect(migrateLegacyAvatar(MARKER)).resolves.toBe(false);
    await expect(storeRemoteAvatar(webpBlob(), MARKER)).resolves.toBe(false);
    await expect(clearLegacyAvatar()).resolves.toBeUndefined();
    await expect(clearAvatar(MARKER)).resolves.toBeUndefined();
  });
});

describe("storeRemoteAvatar", () => {
  it("stores a server-normalized webp under its account version", async () => {
    installIndexedDb();
    const events = installWindow();
    const blob = webpBlob();

    await expect(storeRemoteAvatar(blob, MARKER)).resolves.toBe(true);
    const loaded = await loadAvatar(MARKER);
    expect(loaded).toBeInstanceOf(Blob);
    expect(await (loaded as Blob).arrayBuffer()).toEqual(
      await blob.arrayBuffer(),
    );
    expect(events).toEqual([
      { type: AVATAR_CHANGED_EVENT, detail: MARKER },
    ]);
    await expect(loadAvatar(OTHER_MARKER)).resolves.toBeNull();
  });

  it("refuses an unsafe marker, a non-webp type, and an empty file", async () => {
    installIndexedDb();
    installWindow();
    await expect(storeRemoteAvatar(webpBlob(), "not a marker")).resolves.toBe(
      false,
    );
    await expect(
      storeRemoteAvatar(new Blob([new Uint8Array(20)], { type: "image/png" }), MARKER),
    ).resolves.toBe(false);
    await expect(
      storeRemoteAvatar(new Blob([], { type: "image/webp" }), MARKER),
    ).resolves.toBe(false);
  });

  it("refuses bytes whose container does not match the declared type", async () => {
    installIndexedDb();
    installWindow();
    const lying = new Blob([new Uint8Array(20).fill(0x41)], {
      type: "image/webp",
    });
    await expect(storeRemoteAvatar(lying, MARKER)).resolves.toBe(false);
  });

  it("reports failure when the write is rejected", async () => {
    installIndexedDb({ failWrites: true });
    const events = installWindow();
    await expect(storeRemoteAvatar(webpBlob(), MARKER)).resolves.toBe(false);
    expect(events).toEqual([]);
  });

  it("rejects a marker whose key cannot be derived", async () => {
    installIndexedDb();
    installWindow();
    await expect(loadAvatar("../escape")).resolves.toBeNull();
  });
});

describe("legacy avatar migration", () => {
  it("copies the fixed-key image into the marker-keyed cache once", async () => {
    const data = installIndexedDb();
    const events = installWindow();
    const legacy = webpBlob(16);
    data.set("pfp", legacy);

    expect(await loadLegacyAvatar()).toBe(legacy);
    await expect(migrateLegacyAvatar(MARKER)).resolves.toBe(true);
    expect(await loadAvatar(MARKER)).toBe(legacy);
    expect(events).toEqual([{ type: AVATAR_CHANGED_EVENT, detail: MARKER }]);

    // A second run is a no-op: the marker copy already exists.
    await expect(migrateLegacyAvatar(MARKER)).resolves.toBe(true);
    expect(events).toHaveLength(1);
  });

  it("does nothing when there is no legacy image", async () => {
    installIndexedDb();
    installWindow();
    await expect(loadLegacyAvatar()).resolves.toBeNull();
    await expect(migrateLegacyAvatar(MARKER)).resolves.toBe(false);
  });

  it("refuses to migrate into an unsafe marker", async () => {
    const data = installIndexedDb();
    installWindow();
    data.set("pfp", webpBlob());
    await expect(migrateLegacyAvatar("not a marker")).resolves.toBe(false);
  });

  it("removes only the fixed-key image", async () => {
    const data = installIndexedDb();
    installWindow();
    data.set("pfp", webpBlob());
    data.set(`avatar:${MARKER}`, webpBlob());

    await clearLegacyAvatar();
    expect(data.has("pfp")).toBe(false);
    expect(data.has(`avatar:${MARKER}`)).toBe(true);
  });
});

describe("clearAvatar", () => {
  it("clears one version and announces the change", async () => {
    const data = installIndexedDb();
    const events = installWindow();
    data.set(`avatar:${MARKER}`, webpBlob());
    data.set(`avatar:${OTHER_MARKER}`, webpBlob());

    await clearAvatar(MARKER);
    expect(data.has(`avatar:${MARKER}`)).toBe(false);
    expect(data.has(`avatar:${OTHER_MARKER}`)).toBe(true);
    expect(events).toEqual([{ type: AVATAR_CHANGED_EVENT, detail: MARKER }]);
  });

  it("clears every local avatar during a full device purge", async () => {
    const data = installIndexedDb();
    const events = installWindow();
    data.set("pfp", webpBlob());
    data.set(`avatar:${MARKER}`, webpBlob());

    await clearAvatar();
    expect(data.size).toBe(0);
    expect(events).toEqual([{ type: AVATAR_CHANGED_EVENT, detail: null }]);
  });

  it("confirms a complete cache purge for terminal account deletion", async () => {
    const data = installIndexedDb();
    installWindow();
    data.set("pfp", webpBlob());
    data.set(`avatar:${MARKER}`, webpBlob());

    await expect(purgeAvatarCache()).resolves.toBe(true);
    expect(data.size).toBe(0);
  });

  it("reports a failed terminal purge without announcing or losing retry data", async () => {
    const data = installIndexedDb({ failWrites: true });
    const events = installWindow();
    data.set(`avatar:${MARKER}`, webpBlob());

    await expect(purgeAvatarCache()).resolves.toBe(false);
    expect(data.has(`avatar:${MARKER}`)).toBe(true);
    expect(events).toEqual([]);
  });
});
