"use client";

import {
  isSafeAvatarMarker,
  MAX_AVATAR_OUTPUT_BYTES,
} from "./validation";

export interface RemoteAvatar {
  blob: Blob;
  version: string;
  updatedAt: string;
}

export class AvatarRequestError extends Error {
  constructor() {
    super("BibleQuest could not update the profile photo.");
    this.name = "AvatarRequestError";
  }
}

function remoteAvatarFromResponse(response: Response): Promise<RemoteAvatar> {
  const version = response.headers.get("x-biblequest-avatar-version");
  const updatedAt = response.headers.get("x-biblequest-avatar-updated-at");
  const contentType = response.headers.get("content-type");
  if (
    !response.ok ||
    !isSafeAvatarMarker(version) ||
    !updatedAt ||
    Number.isNaN(Date.parse(updatedAt)) ||
    contentType !== "image/webp"
  ) {
    throw new AvatarRequestError();
  }
  return response.blob().then((blob) => {
    if (
      blob.type !== "image/webp" ||
      blob.size <= 0 ||
      blob.size > MAX_AVATAR_OUTPUT_BYTES
    ) {
      throw new AvatarRequestError();
    }
    return { blob, version, updatedAt };
  });
}

/** Uploads one file and returns the server-normalized private image. */
export async function uploadRemoteAvatar(
  file: File,
  signal?: AbortSignal,
): Promise<RemoteAvatar> {
  const body = new FormData();
  body.set("avatar", file);
  const response = await fetch("/api/profile/avatar", {
    method: "POST",
    body,
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  return remoteAvatarFromResponse(response);
}

/** Downloads the current account avatar without persisting a signed URL. */
export async function downloadRemoteAvatar(
  signal?: AbortSignal,
): Promise<RemoteAvatar | null> {
  const response = await fetch("/api/profile/avatar", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (response.status === 404) return null;
  return remoteAvatarFromResponse(response);
}

/** Removes the current object, or every owned object during account deletion. */
export async function deleteRemoteAvatar(
  allOwnedObjects = false,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/profile/avatar", {
    method: "DELETE",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allOwnedObjects }),
    signal,
  });
  if (!response.ok && response.status !== 404) {
    throw new AvatarRequestError();
  }
}
