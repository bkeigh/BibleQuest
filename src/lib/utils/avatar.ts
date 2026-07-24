/**
 * On-device profile photo storage.
 *
 * Lives BESIDE the zustand blob (pattern of src/lib/sync/last-user.ts) in
 * IndexedDB rather than inside `biblequest:v1`:
 *  - localStorage re-serializes the whole store on every write — a base64
 *    image there is a real main-thread cost;
 *  - the sync engine and "Export journey" must never ship the photo;
 *  - Blobs in IDB avoid base64's +33% and survive better on installed PWAs.
 *
 * The store keeps only opaque avatar metadata as a change marker.
 * All entry points are try/catch-guarded so private mode / quota pressure
 * degrades to "no photo", never to a crash.
 */
import type { Profile } from "@/lib/questos/types";
import {
  isSafeAvatarMarker,
  MAX_AVATAR_EDGE,
  MAX_AVATAR_OUTPUT_BYTES,
  validateAvatarFile,
} from "@/lib/avatar/validation";

const DB_NAME = "biblequest-media";
const STORE = "images";
const LEGACY_KEY = "pfp";
const CACHE_PREFIX = "avatar:";
export const AVATAR_CHANGED_EVENT = "biblequest-avatar-changed";

/** Uses the server version first and falls back to the old local timestamp. */
export function profileAvatarMarker(
  profile: Pick<Profile, "avatarVersion" | "avatarUpdatedAt"> | null | undefined,
): string | null {
  const marker = profile?.avatarVersion ?? profile?.avatarUpdatedAt ?? null;
  return isSafeAvatarMarker(marker) ? marker : null;
}

function cacheKey(marker: string): string | null {
  return isSafeAvatarMarker(marker) ? `${CACHE_PREFIX}${marker}` : null;
}

function reportAvatarChange(marker: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AVATAR_CHANGED_EVENT, { detail: marker }),
  );
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Decode with createImageBitmap, falling back to an <img> element decode —
 * Safari can render some formats (e.g. HEIC) it won't hand to
 * createImageBitmap. Returns null when the browser can't decode it at all. */
async function decode(
  file: Blob
): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      return null;
    } finally {
      // decode() has already rasterized; the drawImage below reads pixels
      // synchronously in the same task, before GC can collect the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

/**
 * Downscale + re-encode to keep the stored photo small (~20–60 KB).
 * Returns null when the image can't be decoded — storing an undecodable
 * blob would "succeed" into a permanently blank avatar.
 */
async function normalize(file: Blob): Promise<Blob | null> {
  if (!(await validateAvatarFile(file))) return null;
  const source = await decode(file);
  if (!source) return null;
  try {
    const sw = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sh = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!sw || !sh) return null;
    const scale = Math.min(1, MAX_AVATAR_EDGE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);
    if (source instanceof ImageBitmap) source.close();
    // Safari pre-17 ignores the webp type and falls back to png — fine.
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85)
    );
    return blob;
  } catch {
    return null;
  }
}

/** Saves one guest/local image under its non-identifying change marker. */
export async function saveAvatar(
  file: Blob,
  marker: string,
): Promise<boolean> {
  const key = cacheKey(marker);
  if (!key) return false;
  const blob = await normalize(file);
  if (!blob || blob.size > MAX_AVATAR_OUTPUT_BYTES) return false;
  return storeBlobAtKey(key, blob, marker);
}

/** Stores a server-normalized image under its opaque account version. */
export async function storeRemoteAvatar(
  file: Blob,
  marker: string,
): Promise<boolean> {
  const key = cacheKey(marker);
  if (
    !key ||
    file.type !== "image/webp" ||
    file.size <= 0 ||
    file.size > MAX_AVATAR_OUTPUT_BYTES ||
    !(await validateAvatarFile(file))
  ) {
    return false;
  }
  return storeBlobAtKey(key, file, marker);
}

async function storeBlobAtKey(
  key: string,
  blob: Blob,
  marker: string,
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  const result = await new Promise<boolean>((resolve) => {
    try {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(blob, key);
      t.oncomplete = () => resolve(true);
      t.onerror = () => resolve(false);
      t.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  db.close();
  if (result) reportAvatarChange(marker);
  return result;
}

export async function loadAvatar(marker: string): Promise<Blob | null> {
  const key = cacheKey(marker);
  if (!key) return null;
  const db = await openDb();
  if (!db) return null;
  const result = await tx(db, "readonly", (s) => s.get(key));
  db.close();
  return result instanceof Blob ? result : null;
}

/** Reads the fixed-key avatar created by releases before account media sync. */
export async function loadLegacyAvatar(): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await tx(db, "readonly", (s) => s.get(LEGACY_KEY));
  db.close();
  return result instanceof Blob ? result : null;
}

/** Copies a legacy guest image into the marker-keyed cache once. */
export async function migrateLegacyAvatar(marker: string): Promise<boolean> {
  const existing = await loadAvatar(marker);
  if (existing) return true;
  const legacy = await loadLegacyAvatar();
  if (!legacy) return false;
  const key = cacheKey(marker);
  return key ? storeBlobAtKey(key, legacy, marker) : false;
}

/** Removes only the pre-sync fixed-key image after safe migration or removal. */
export async function clearLegacyAvatar(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await tx(db, "readwrite", (store) => store.delete(LEGACY_KEY));
  db.close();
}

/** Clears one cached version, or every local avatar during full device purge. */
export async function clearAvatar(marker?: string | null): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const key = marker ? cacheKey(marker) : null;
  await tx(db, "readwrite", (store) =>
    key ? store.delete(key) : store.clear(),
  );
  db.close();
  reportAvatarChange(marker ?? null);
}
