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
 * The store only keeps `profile.avatarUpdatedAt` as a change marker.
 * All entry points are try/catch-guarded so private mode / quota pressure
 * degrades to "no photo", never to a crash.
 */

const DB_NAME = "biblequest-media";
const STORE = "images";
const KEY = "pfp";
/** Longest edge of the stored image. Plenty for a 96px avatar on 3x screens. */
const MAX_EDGE = 320;

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
  const source = await decode(file);
  if (!source) return null;
  try {
    const sw = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sh = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!sw || !sh) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
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

/** Save (replacing any previous photo). Returns false when storage failed. */
export async function saveAvatar(file: Blob): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  const blob = await normalize(file);
  if (!blob) {
    db.close();
    return false;
  }
  const result = await new Promise<boolean>((resolve) => {
    try {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(blob, KEY);
      t.oncomplete = () => resolve(true);
      t.onerror = () => resolve(false);
      t.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
  db.close();
  return result;
}

export async function loadAvatar(): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await tx(db, "readonly", (s) => s.get(KEY));
  db.close();
  return result instanceof Blob ? result : null;
}

export async function clearAvatar(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await tx(db, "readwrite", (s) => s.delete(KEY));
  db.close();
}
