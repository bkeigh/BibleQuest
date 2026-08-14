/**
 * Owns the private avatar upload boundary: authenticate, validate origin and
 * byte limits, verify image signatures, normalize to WebP, then update the
 * user's private storage path through a database-owned mutation contract.
 */
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
import { guardIdentifiedRequest } from "@/lib/bible/provider-request-guard";
import {
  distributedPoliciesFromWindows,
  guardDistributedRequest,
} from "@/lib/security/distributed-rate-limit.server";
import {
  recordServerFailure,
  recordServerFailureReason,
  type ServerFailureStage,
} from "@/lib/observability/server-failures";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { isNativeAppOrigin } from "@/lib/http/native-origin";
import {
  ACCOUNT_DELETION_CLEANUP_HEADER,
  ACCOUNT_DELETION_CLEANUP_HEADER_VALUE,
  EXPECTED_ACCOUNT_USER_HEADER,
} from "@/lib/sync/native-beta-headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AVATAR_BUCKET = "profile-avatars";
const AVATAR_CONTRACT = "biblequest_profile_avatar_v1";
const MAX_FORM_BYTES = MAX_AVATAR_INPUT_BYTES + 64 * 1024;
const AVATAR_UPLOAD_RATE_POLICIES = [
  { limit: 5, windowMs: 10 * 60_000 },
  { limit: 20, windowMs: 24 * 60 * 60_000 },
] as const;
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

/**
 * Proves the private bucket and dedicated RPC boundary before media access. A
 * null stage means the surface is deliberately dormant, where a missing
 * contract is expected rather than an operational failure.
 */
async function avatarContractReady(
  supabase: SupabaseClient,
  stage: ServerFailureStage | null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("profile_avatar_contract");
  if (error) {
    if (stage) recordServerFailure("avatar", stage, error);
    return false;
  }
  if (!isAvatarContract(data)) {
    if (stage) recordServerFailureReason("avatar", stage, "schema");
    return false;
  }
  return true;
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
  if (error) throw new Error("avatar profile unavailable", { cause: error });
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
export async function GET(request: Request) {
  if (!featureEnabled()) return privateError("unavailable", 503);
  const context = await authenticatedServerContext(request);
  if (context instanceof Response) return context;
  const { supabase, user } = context;
  if (!(await avatarContractReady(supabase, "read"))) {
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
  } catch (error) {
    recordServerFailure("avatar", "read", error);
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

  const context = await authenticatedServerContext(request);
  if (context instanceof Response) return context;
  const { supabase, user } = context;
  if (!(await avatarContractReady(supabase, "write"))) {
    return privateError("unavailable", 503);
  }

  // Reserve per-account capacity before any expensive image decode or resize.
  const blocked = guardIdentifiedRequest(
    request,
    `avatar-upload:${user.id}`,
    AVATAR_UPLOAD_RATE_POLICIES,
  );
  if (blocked) return blocked;
  const distributedBlocked = await guardDistributedRequest(
    request,
    "avatar-upload",
    distributedPoliciesFromWindows(AVATAR_UPLOAD_RATE_POLICIES),
    user.id,
  );
  if (distributedBlocked) return distributedBlocked;

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
  if (uploadError) {
    recordServerFailure("avatar", "write", uploadError);
    return privateError("upload_failed", 503);
  }

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
    recordServerFailure("avatar", "write", pointerError);
    const { error: rollbackError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([path]);
    // A stranded object is invisible to the account but still consumes the
    // private bucket, so the operator needs the failed rollback recorded.
    if (rollbackError) recordServerFailure("avatar", "delete", rollbackError);
    return privateError("upload_failed", 503);
  }

  if (
    result.previous_path &&
    result.previous_path !== path &&
    ownedAvatarPath(user.id, result.previous_path)
  ) {
    // The new pointer is already authoritative; obsolete cleanup is best effort
    // and only recorded so repeated leaks are visible to the operator.
    const { error: cleanupError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([result.previous_path]);
    if (cleanupError) recordServerFailure("avatar", "delete", cleanupError);
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
    if (error) {
      recordServerFailure("avatar", "delete", error);
      return false;
    }
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
    if (removeError) {
      recordServerFailure("avatar", "delete", removeError);
      return false;
    }
    if ((data ?? []).length < 100) return true;
  }
}

/** Allows only the known web bridge while Production is still pre-0037. */
function missingAccountDeletionLatch(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    (candidate.code === "PGRST202" || candidate.code === "42883") &&
    typeof candidate.message === "string" &&
    candidate.message.includes("begin_own_account_deletion")
  );
}

/** Deletes remote media before clearing its profile pointer. */
export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext(request);
  if (context instanceof Response) return context;
  const { supabase, user } = context;
  const contractReady = await avatarContractReady(
    supabase,
    featureEnabled() ? "delete" : null,
  );
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
    const accountDeletionCleanup =
      allOwnedObjects &&
      request.headers.get(ACCOUNT_DELETION_CLEANUP_HEADER) ===
        ACCOUNT_DELETION_CLEANUP_HEADER_VALUE &&
      request.headers.get(EXPECTED_ACCOUNT_USER_HEADER) === user.id;
    const nativeDeletionCleanup =
      accountDeletionCleanup && isNativeAppOrigin(request);
    let expectedPath: string | null = null;
    if (!nativeDeletionCleanup) {
      // Normal clears prove the profile read before touching Storage. When the
      // beta is disabled, restrictive RLS stops this path with data intact.
      const profile = await avatarProfile(supabase, user.id);
      expectedPath = profile?.avatar_path ?? null;
    }
    if (accountDeletionCleanup) {
      // The durable database latch waits out in-flight uploads and denies new
      // ones before the final owner-folder sweep begins.
      const { error } = await supabase.rpc("begin_own_account_deletion");
      // The currently deployed web client predates 0037. Preserve its existing
      // deletion behavior only for the exact missing-function bridge; native
      // cleanup still requires the latch because it can run while disabled.
      if (
        error &&
        (nativeDeletionCleanup || !missingAccountDeletionLatch(error))
      ) {
        recordServerFailure("avatar", "delete", error);
        return privateError("delete_failed", 503);
      }
    }
    if (allOwnedObjects) {
      // The explicit account-deletion boundary uses the server credential for
      // the final owner-folder sweep. This avoids cookie-session Storage
      // ambiguity while the authenticated subject still fixes the only prefix
      // the privileged client may list or remove.
      const storageClient = accountDeletionCleanup
        ? createAdminSupabase()
        : supabase;
      // Deletion cleanup cannot pre-read a disabled beta profile. The exact
      // cleanup header lets the RPC clear this authenticated owner's pointer.
      if (!(await removeAllOwnedObjects(storageClient, user.id))) {
        return privateError("delete_failed", 503);
      }
    } else {
      if (expectedPath) {
        if (!ownedAvatarPath(user.id, expectedPath)) {
          return privateError("delete_failed", 503);
        }
        const { error } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([expectedPath]);
        if (error) {
          recordServerFailure("avatar", "delete", error);
          return privateError("delete_failed", 503);
        }
      }
    }

    const { data, error } = await supabase.rpc("clear_profile_avatar", {
      p_expected_path: expectedPath,
    });
    const result = data as AvatarClearResult | null;
    if (error || !result) {
      recordServerFailure("avatar", "delete", error);
      return privateError("delete_failed", 503);
    }
    if (!result.cleared) return privateError("avatar_changed", 409);
    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    recordServerFailure("avatar", "delete", error);
    return privateError("delete_failed", 503);
  }
}
