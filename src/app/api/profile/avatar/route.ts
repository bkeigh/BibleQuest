import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  InvalidAvatarImageError,
  normalizeAvatarImage,
} from "@/lib/avatar/image.server";
import {
  avatarContainerHasExactEnd,
  avatarMimeFromSignature,
  isSafeAvatarMarker,
  MAX_AVATAR_INPUT_BYTES,
  MAX_AVATAR_OUTPUT_BYTES,
} from "@/lib/avatar/validation";
import { boundedBytes, boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AVATAR_BUCKET = "profile-avatars";
const AVATAR_CONTRACT = "biblequest_profile_avatar_v1";
const MAX_FORM_BYTES = MAX_AVATAR_INPUT_BYTES + 64 * 1024;
const PRIVATE_IMAGE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "image/webp",
  "X-Content-Type-Options": "nosniff",
};

interface AvatarProfileRow {
  avatar_path: string | null;
  avatar_version: string | null;
  avatar_updated_at: string | null;
}

interface AvatarMutationResult extends AvatarProfileRow {
  previous_path: string | null;
}

interface AvatarClearResult {
  cleared: boolean;
  previous_path: string | null;
}

function featureEnabled(): boolean {
  return process.env.BIBLEQUEST_AVATAR_SYNC_ENABLED === "true";
}

function isAvatarContract(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "contract,ok" &&
    (value as { contract?: unknown }).contract === AVATAR_CONTRACT &&
    (value as { ok?: unknown }).ok === true
  );
}

function ownedAvatarPath(userId: string, value: unknown): value is string {
  return (
    typeof value === "string" &&
    new RegExp(
      `^${userId}/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}` +
        `-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$`,
      "i",
    ).test(value)
  );
}

/** Proves the private bucket and dedicated RPC boundary before media access. */
async function avatarContractReady(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("profile_avatar_contract");
  return !error && isAvatarContract(data);
}

/** Reads only the authenticated user's avatar pointer. */
async function avatarProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<AvatarProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_path,avatar_version,avatar_updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("avatar profile unavailable");
  return data as AvatarProfileRow | null;
}

function avatarResponse(
  bytes: Uint8Array,
  version: string,
  updatedAt: string,
): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      ...PRIVATE_IMAGE_HEADERS,
      "Content-Length": String(bytes.byteLength),
      "X-BibleQuest-Avatar-Version": version,
      "X-BibleQuest-Avatar-Updated-At": updatedAt,
    },
  });
}

/** Serves the current private object through the user's authenticated session. */
export async function GET() {
  if (!featureEnabled()) return privateError("unavailable", 503);
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const { supabase, user } = context;
  if (!(await avatarContractReady(supabase))) {
    return privateError("unavailable", 503);
  }

  try {
    const profile = await avatarProfile(supabase, user.id);
    if (
      !profile?.avatar_path ||
      !ownedAvatarPath(user.id, profile.avatar_path) ||
      !isSafeAvatarMarker(profile.avatar_version) ||
      !profile.avatar_updated_at ||
      Number.isNaN(Date.parse(profile.avatar_updated_at))
    ) {
      return privateError("not_found", 404);
    }

    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .download(profile.avatar_path);
    if (error || !data || data.size > MAX_AVATAR_OUTPUT_BYTES) {
      return privateError("not_found", 404);
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (
      avatarMimeFromSignature(bytes) !== "image/webp" ||
      !avatarContainerHasExactEnd(bytes, "image/webp")
    ) {
      return privateError("not_found", 404);
    }
    return avatarResponse(
      bytes,
      profile.avatar_version,
      profile.avatar_updated_at,
    );
  } catch {
    return privateError("unavailable", 503);
  }
}

/** Uploads first, atomically switches the row, then removes the obsolete object. */
export async function POST(request: Request) {
  if (!featureEnabled()) return privateError("unavailable", 503);
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.length > 256 ||
    !/^multipart\/form-data;\s*boundary=[\x20-\x7e]{1,200}$/i.test(contentType)
  ) {
    return privateError("invalid_avatar", 400);
  }

  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const { supabase, user } = context;
  if (!(await avatarContractReady(supabase))) {
    return privateError("unavailable", 503);
  }

  let normalized: Uint8Array;
  try {
    // Reparse only the capped bytes so chunked uploads cannot force an
    // unbounded multipart allocation before image validation begins.
    const bytes = await boundedBytes(request, MAX_FORM_BYTES);
    if (bytes instanceof Response) {
      return privateError("invalid_avatar", bytes.status);
    }
    const form = await new Response(bytes, {
      headers: { "Content-Type": contentType },
    }).formData();
    const file = form.get("avatar");
    const fields = [...form.keys()];
    if (
      !(file instanceof File) ||
      fields.length !== 1 ||
      fields[0] !== "avatar" ||
      form.getAll("avatar").length !== 1
    ) {
      return privateError("invalid_avatar", 400);
    }
    normalized = await normalizeAvatarImage(
      await file.arrayBuffer(),
      file.type,
    );
  } catch (error) {
    return privateError(
      "invalid_avatar",
      error instanceof InvalidAvatarImageError ? 400 : 413,
    );
  }

  const version = randomUUID();
  const path = `${user.id}/avatar-${version}.webp`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, normalized, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });
  if (uploadError) return privateError("upload_failed", 503);

  const { data, error: pointerError } = await supabase.rpc(
    "set_profile_avatar",
    {
      p_avatar_path: path,
      p_avatar_version: version,
    },
  );
  const result = data as AvatarMutationResult | null;
  if (
    pointerError ||
    !result ||
    result.avatar_path !== path ||
    result.avatar_version !== version ||
    !result.avatar_updated_at ||
    Number.isNaN(Date.parse(result.avatar_updated_at))
  ) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    return privateError("upload_failed", 503);
  }

  if (
    result.previous_path &&
    result.previous_path !== path &&
    ownedAvatarPath(user.id, result.previous_path)
  ) {
    // The new pointer is already authoritative; obsolete cleanup is best effort.
    await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([result.previous_path]);
  }

  return avatarResponse(normalized, version, result.avatar_updated_at);
}

/** Lists and deletes every owned object in bounded pages for account cleanup. */
async function removeAllOwnedObjects(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  for (;;) {
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list(userId, {
        limit: 100,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) return false;
    // Storage RLS confines the list to this folder. Remove every plain child
    // name so stale objects cannot keep Auth account deletion from succeeding.
    const paths = (data ?? [])
      .map(({ name }) => name)
      .filter(
        (name) =>
          Boolean(name) &&
          name !== "." &&
          name !== ".." &&
          !name.includes("/") &&
          !name.includes("\\"),
      )
      .map((name) => `${userId}/${name}`);
    if (paths.length === 0) return true;
    const { error: removeError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove(paths);
    if (removeError) return false;
    if ((data ?? []).length < 100) return true;
  }
}

/** Deletes remote media before clearing its profile pointer. */
export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const { supabase, user } = context;
  const contractReady = await avatarContractReady(supabase);
  if (!contractReady) {
    return featureEnabled()
      ? privateError("unavailable", 503)
      : new NextResponse(null, { status: 204 });
  }

  let allOwnedObjects = false;
  const body = await boundedJson(request, 1024);
  if (body instanceof Response) return body;
  try {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "allOwnedObjects") ||
      typeof (body as { allOwnedObjects?: unknown }).allOwnedObjects !==
        "boolean"
    ) {
      return privateError("invalid_request", 400);
    }
    allOwnedObjects = (body as { allOwnedObjects: boolean }).allOwnedObjects;
  } catch {
    return privateError("invalid_request", 400);
  }

  try {
    const profile = await avatarProfile(supabase, user.id);
    if (allOwnedObjects) {
      if (!(await removeAllOwnedObjects(supabase, user.id))) {
        return privateError("delete_failed", 503);
      }
    } else if (profile?.avatar_path) {
      if (!ownedAvatarPath(user.id, profile.avatar_path)) {
        return privateError("delete_failed", 503);
      }
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([profile.avatar_path]);
      if (error) return privateError("delete_failed", 503);
    }

    const { data, error } = await supabase.rpc("clear_profile_avatar", {
      p_expected_path: profile?.avatar_path ?? null,
    });
    const result = data as AvatarClearResult | null;
    if (error || !result) return privateError("delete_failed", 503);
    if (!result.cleared) return privateError("avatar_changed", 409);
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return privateError("delete_failed", 503);
  }
}
