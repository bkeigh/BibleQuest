import "server-only";

import sharp from "sharp";
import {
  avatarContainerHasExactEnd,
  avatarMimeFromSignature,
  MAX_AVATAR_EDGE,
  MAX_AVATAR_INPUT_BYTES,
  MAX_AVATAR_OUTPUT_BYTES,
  MAX_AVATAR_SOURCE_EDGE,
  MAX_AVATAR_SOURCE_PIXELS,
  MIN_AVATAR_SOURCE_EDGE,
  type AvatarInputMimeType,
} from "./validation";

export class InvalidAvatarImageError extends Error {
  constructor() {
    super("The profile image is invalid.");
    this.name = "InvalidAvatarImageError";
  }
}

const SHARP_FORMAT_TO_MIME: Record<string, AvatarInputMimeType | undefined> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Verifies, bounds, orients, crops, and strips metadata from one avatar. */
export async function normalizeAvatarImage(
  input: ArrayBuffer,
  claimedMimeType: string,
): Promise<Uint8Array> {
  if (input.byteLength <= 0 || input.byteLength > MAX_AVATAR_INPUT_BYTES) {
    throw new InvalidAvatarImageError();
  }

  const bytes = new Uint8Array(input);
  const detectedMimeType = avatarMimeFromSignature(bytes);
  if (
    !detectedMimeType ||
    detectedMimeType !== claimedMimeType ||
    !avatarContainerHasExactEnd(bytes, detectedMimeType)
  ) {
    throw new InvalidAvatarImageError();
  }

  try {
    const source = sharp(bytes, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_AVATAR_SOURCE_PIXELS,
      sequentialRead: true,
    });
    const metadata = await source.metadata();
    if (
      SHARP_FORMAT_TO_MIME[metadata.format ?? ""] !== detectedMimeType ||
      (metadata.pages !== undefined && metadata.pages !== 1) ||
      !metadata.width ||
      !metadata.height ||
      Math.min(metadata.width, metadata.height) < MIN_AVATAR_SOURCE_EDGE ||
      Math.max(metadata.width, metadata.height) > MAX_AVATAR_SOURCE_EDGE ||
      metadata.width * metadata.height > MAX_AVATAR_SOURCE_PIXELS
    ) {
      throw new InvalidAvatarImageError();
    }

    const normalized = await source
      .rotate()
      .resize(MAX_AVATAR_EDGE, MAX_AVATAR_EDGE, {
        fit: "cover",
        position: "attention",
        withoutEnlargement: false,
      })
      .webp({ quality: 84, effort: 5, smartSubsample: true })
      .toBuffer();
    if (
      normalized.length <= 0 ||
      normalized.length > MAX_AVATAR_OUTPUT_BYTES
    ) {
      throw new InvalidAvatarImageError();
    }
    return normalized;
  } catch (error) {
    if (error instanceof InvalidAvatarImageError) throw error;
    throw new InvalidAvatarImageError();
  }
}
