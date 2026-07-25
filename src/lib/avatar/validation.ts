export const AVATAR_INPUT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AvatarInputMimeType = (typeof AVATAR_INPUT_MIME_TYPES)[number];

export const MAX_AVATAR_INPUT_BYTES = 4 * 1024 * 1024;
export const MAX_AVATAR_OUTPUT_BYTES = 1024 * 1024;
export const MAX_AVATAR_EDGE = 512;
export const MAX_AVATAR_SOURCE_EDGE = 12_000;
export const MAX_AVATAR_SOURCE_PIXELS = 40_000_000;
export const MIN_AVATAR_SOURCE_EDGE = 16;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_MARKER =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

/** Accepts only server UUID versions or pre-sync ISO change markers. */
export function isSafeAvatarMarker(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    (UUID.test(value) || LEGACY_MARKER.test(value))
  );
}

/** Returns the raster format proved by its leading container signature. */
export function avatarMimeFromSignature(
  bytes: Uint8Array,
): AvatarInputMimeType | null {
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Rejects common appended-data polyglots before the decoder re-encodes them. */
export function avatarContainerHasExactEnd(
  bytes: Uint8Array,
  mimeType: AvatarInputMimeType,
): boolean {
  if (mimeType === "image/jpeg") {
    return jpegEndsAtFirstEoi(bytes);
  }
  if (mimeType === "image/png") {
    return pngEndsAtIend(bytes);
  }

  if (bytes.length < 12) return false;
  const declaredSize =
    bytes[4] |
    (bytes[5] << 8) |
    (bytes[6] << 16) |
    (bytes[7] << 24);
  return declaredSize >= 4 && declaredSize + 8 === bytes.length;
}

/** Walks PNG chunks so a fake trailing IEND marker cannot mask appended data. */
function pngEndsAtIend(bytes: Uint8Array): boolean {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length =
      bytes[offset] * 0x1000000 +
      bytes[offset + 1] * 0x10000 +
      bytes[offset + 2] * 0x100 +
      bytes[offset + 3];
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) return false;
    const isIend =
      bytes[offset + 4] === 0x49 &&
      bytes[offset + 5] === 0x45 &&
      bytes[offset + 6] === 0x4e &&
      bytes[offset + 7] === 0x44;
    if (isIend) return length === 0 && end === bytes.length;
    offset = end;
  }
  return false;
}

/** Walks JPEG segments and entropy scans to require the first EOI at EOF. */
function jpegEndsAtFirstEoi(bytes: Uint8Array): boolean {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  ) {
    return false;
  }
  let offset = 2;
  let inScan = false;
  while (offset < bytes.length) {
    if (inScan && bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset];
    offset += 1;
    if (inScan && marker === 0x00) continue;
    if (marker === 0xd9) return offset === bytes.length;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue;
    if (marker === 0xd8 || marker === 0x00 || offset + 2 > bytes.length) {
      return false;
    }
    const segmentLength = bytes[offset] * 0x100 + bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return false;
    }
    inScan = marker === 0xda;
    offset += segmentLength;
  }
  return false;
}

/** Performs bounded client checks before any decode or network request. */
export async function validateAvatarFile(file: Blob): Promise<boolean> {
  if (
    file.size <= 0 ||
    file.size > MAX_AVATAR_INPUT_BYTES ||
    !AVATAR_INPUT_MIME_TYPES.includes(file.type as AvatarInputMimeType)
  ) {
    return false;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = avatarMimeFromSignature(bytes);
    return (
      detected === file.type &&
      avatarContainerHasExactEnd(bytes, detected)
    );
  } catch {
    return false;
  }
}
