import { boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import {
  assertPushEncryptionReady,
  encryptPushSubscription,
  pushEndpointFingerprint,
} from "@/lib/push/crypto.server";
import { pushVapidPublicKey } from "@/lib/push/delivery.server";
import {
  pushContractReady,
  pushFeatureEnabled,
  pushPreferencesToRow,
} from "@/lib/push/server";
import {
  anyPushReminderEnabled,
  isValidPushEndpoint,
  MAX_PUSH_REQUEST_BYTES,
  parsePushReminderPreferences,
  parseSerializedPushSubscription,
} from "@/lib/push/validation";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function objectValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Creates or transfers one browser endpoint after user-granted permission. */
export async function POST(request: Request) {
  if (!pushFeatureEnabled()) return privateError("unavailable", 503);
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  if (!(await pushContractReady(context.supabase))) {
    return privateError("unavailable", 503);
  }
  const body = await boundedJson(request, MAX_PUSH_REQUEST_BYTES);
  if (body instanceof Response) return body;
  if (
    !objectValue(body) ||
    Object.keys(body).sort().join(",") !== "preferences,subscription"
  ) {
    return privateError("invalid_request", 400);
  }
  const subscription = parseSerializedPushSubscription(body.subscription);
  const preferences = parsePushReminderPreferences(body.preferences);
  if (
    !subscription ||
    !preferences ||
    !anyPushReminderEnabled(preferences)
  ) {
    return privateError("invalid_request", 400);
  }

  try {
    assertPushEncryptionReady();
    pushVapidPublicKey();
    const encrypted = encryptPushSubscription(subscription);
    const admin = createAdminSupabase();
    const preferenceWrite = await admin
      .from("push_reminder_preferences")
      .upsert(pushPreferencesToRow(context.user.id, preferences), {
        onConflict: "user_id",
      });
    if (preferenceWrite.error) return privateError("unavailable", 503);

    const { data: existing, error: lookupError } = await admin
      .from("push_subscriptions")
      .select("id,user_id")
      .eq("endpoint_fingerprint", encrypted.endpointFingerprint)
      .maybeSingle();
    if (lookupError) return privateError("unavailable", 503);
    if (existing && existing.user_id !== context.user.id) {
      const { error } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("id", existing.id);
      if (error) return privateError("unavailable", 503);
    }

    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: context.user.id,
        endpoint_fingerprint: encrypted.endpointFingerprint,
        encrypted_subscription: encrypted.encryptedSubscription,
        encryption_key_version: encrypted.encryptionKeyVersion,
        expiration_time:
          subscription.expirationTime === null
            ? null
            : new Date(subscription.expirationTime).toISOString(),
        transient_failures: 0,
        last_failure_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint_fingerprint" },
    );
    return error
      ? privateError("unavailable", 503)
      : new Response(null, {
          status: 204,
          headers: { "Cache-Control": "private, no-store" },
        });
  } catch {
    return privateError("unavailable", 503);
  }
}

/** Removes one current endpoint or every endpoint owned by the account. */
export async function DELETE(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const contractReady = await pushContractReady(context.supabase);
  if (!contractReady) {
    return pushFeatureEnabled()
      ? privateError("unavailable", 503)
      : new Response(null, { status: 204 });
  }
  const body = await boundedJson(request, MAX_PUSH_REQUEST_BYTES);
  if (body instanceof Response) return body;
  if (!objectValue(body)) return privateError("invalid_request", 400);
  const keys = Object.keys(body);
  const deleteAll = keys.length === 1 && body.all === true;
  const endpoint =
    keys.length === 1 && isValidPushEndpoint(body.endpoint)
      ? body.endpoint
      : null;
  if (!deleteAll && !endpoint) return privateError("invalid_request", 400);

  try {
    let operation = createAdminSupabase()
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.user.id);
    if (endpoint) {
      operation = operation.eq(
        "endpoint_fingerprint",
        pushEndpointFingerprint(endpoint),
      );
    }
    const { error } = await operation;
    return error
      ? privateError("unavailable", 503)
      : new Response(null, {
          status: 204,
          headers: { "Cache-Control": "private, no-store" },
        });
  } catch {
    return privateError("unavailable", 503);
  }
}
