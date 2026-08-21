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
import {
  withDevicePrivateRemovalGuard as withWebPrivateRemovalGuard,
  devicePrivateStorageReadAllowed as webPrivateStorageReadAllowed,
  withDevicePrivateWriteGuard as withWebPrivateWriteGuard,
} from "@/lib/storage/device-private-write";
import {
  DEVICE_AVATAR_DATABASE_NAME as LEGACY_AVATAR_DATABASE_NAME,
  PROTECTED_AVATAR_DATABASE_NAME as WEB_V2_AVATAR_DATABASE_NAME,
  selectDevicePrivateAvatarDatabase as selectedWebPrivateAvatarDatabase,
} from "@/lib/storage/device-private-storage";
import {
  devicePrivateWriteGuardIsCurrent as webPrivateWriteGuardIsCurrent,
} from "@/lib/storage/device-private-write";

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

/** Selects the avatar namespace only after the shared v2 marker commits. */
function selectedAvatarDatabaseName(): string | null {
  try {
    return selectedWebPrivateAvatarDatabase(window.localStorage);
  } catch {
    return null;
  }
}

/** Opens a writable avatar database only inside an already-held mutation guard. */
function openDb(name: string | null): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (!name) return resolve(null);
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(name, 1);
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

/** Opens an existing database without creating storage during a private read. */
function openExistingDb(name: string | null): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (!name || typeof indexedDB === "undefined") return resolve(null);
      let created = false;
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => {
        created = true;
        request.transaction?.abort();
      };
      request.onsuccess = () => {
        if (created) {
          request.result.close();
          resolve(null);
          return;
        }
        resolve(request.result);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Commits one IDB mutation only while its auth/removal authority stays live. */
function mutateAvatarStore(
  db: IDBDatabase,
  run: (store: IDBObjectStore) => IDBRequest,
  authorizationIsCurrent: () => boolean,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!authorizationIsCurrent()) return resolve(false);
      const transaction = db.transaction(STORE, "readwrite");
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => {
        if (!authorizationIsCurrent()) transaction.abort();
      };
      transaction.oncomplete = () => resolve(authorizationIsCurrent());
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
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
  return storeBlobAtKey(key, async () => {
    const blob = await normalize(file);
    return blob && blob.size <= MAX_AVATAR_OUTPUT_BYTES ? blob : null;
  }, marker);
}

/** Stores a server-normalized image under its opaque account version. */
export async function storeRemoteAvatar(
  file: Blob,
  marker: string,
): Promise<boolean> {
  const key = cacheKey(marker);
  if (!key) return false;
  return storeBlobAtKey(key, async () => {
    if (
      file.type !== "image/webp" ||
      file.size <= 0 ||
      file.size > MAX_AVATAR_OUTPUT_BYTES ||
      !(await validateAvatarFile(file))
    ) {
      return null;
    }
    return file;
  }, marker);
}

async function storeBlobAtKey(
  key: string,
  resolveBlob: () => Promise<Blob | null>,
  marker: string,
): Promise<boolean> {
  const result = await withWebPrivateWriteGuard(async (guard) => {
    const authorizationIsCurrent = () =>
      !guard || webPrivateWriteGuardIsCurrent(guard);
    const blob = await resolveBlob();
    if (!blob || !authorizationIsCurrent()) return { value: false };
    const db = await openDb(selectedAvatarDatabaseName());
    if (!db) return { value: false };
    const committed = await mutateAvatarStore(
      db,
      (store) => store.put(blob, key),
      authorizationIsCurrent,
    );
    db.close();
    return { value: committed };
  });
  const committed = result.committed && result.value;
  if (committed) reportAvatarChange(marker);
  return committed;
}

export async function loadAvatar(marker: string): Promise<Blob | null> {
  const key = cacheKey(marker);
  if (!key) return null;
  try {
    if (!webPrivateStorageReadAllowed(window.localStorage)) return null;
  } catch {
    return null;
  }
  const databaseName = selectedAvatarDatabaseName();
  const db = await openExistingDb(databaseName);
  if (!db) return null;
  const result = await tx(db, "readonly", (s) => s.get(key));
  db.close();
  try {
    return webPrivateStorageReadAllowed(window.localStorage) &&
      selectedAvatarDatabaseName() === databaseName &&
      result instanceof Blob
      ? result
      : null;
  } catch {
    return null;
  }
}

/** Reads the fixed-key avatar created by releases before account media sync. */
export async function loadLegacyAvatar(): Promise<Blob | null> {
  try {
    if (!webPrivateStorageReadAllowed(window.localStorage)) return null;
  } catch {
    return null;
  }
  const databaseName = selectedAvatarDatabaseName();
  const db = await openExistingDb(databaseName);
  if (!db) return null;
  const result = await tx(db, "readonly", (s) => s.get(LEGACY_KEY));
  db.close();
  try {
    return webPrivateStorageReadAllowed(window.localStorage) &&
      selectedAvatarDatabaseName() === databaseName &&
      result instanceof Blob
      ? result
      : null;
  } catch {
    return null;
  }
}

/** Copies a legacy guest image into the marker-keyed cache once. */
export async function migrateLegacyAvatar(marker: string): Promise<boolean> {
  const existing = await loadAvatar(marker);
  if (existing) return true;
  const legacy = await loadLegacyAvatar();
  if (!legacy) return false;
  const key = cacheKey(marker);
  return key ? storeBlobAtKey(key, async () => legacy, marker) : false;
}

/** Removes only the pre-sync fixed-key image after safe migration or removal. */
export async function clearLegacyAvatar(): Promise<void> {
  await removeAvatarEntry(LEGACY_KEY);
}

/** Clears one cached version, or every local avatar during full device purge. */
export async function clearAvatar(marker?: string | null): Promise<void> {
  const key = marker ? cacheKey(marker) : null;
  const removed = await removeAvatarEntry(key);
  if (removed) reportAvatarChange(marker ?? null);
}

/** Clear and confirm the complete local avatar cache for terminal deletion. */
export async function purgeAvatarCache(): Promise<boolean> {
  const results = [];
  for (const databaseName of [
    LEGACY_AVATAR_DATABASE_NAME,
    WEB_V2_AVATAR_DATABASE_NAME,
  ]) {
    results.push(await removeAvatarEntry(null, databaseName));
  }
  const cleared = results.every(Boolean);
  if (cleared) {
    reportAvatarChange(null);
  }
  return cleared;
}

/** Removes one entry or store only through ordinary/reviewed removal authority. */
async function removeAvatarEntry(
  key: string | null,
  databaseName?: string | null,
): Promise<boolean> {
  const result = await withWebPrivateRemovalGuard(
    async (authorizationIsCurrent) => {
      const resolvedDatabaseName = databaseName === undefined
        ? selectedAvatarDatabaseName()
        : databaseName;
      const db = await openDb(resolvedDatabaseName);
      if (!db) return { value: false };
      const committed = await mutateAvatarStore(
        db,
        (store) => (key ? store.delete(key) : store.clear()),
        authorizationIsCurrent,
      );
      db.close();
      return { value: committed };
    },
  );
  return result.committed && result.value;
}
