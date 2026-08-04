import { createHash, timingSafeEqual } from "node:crypto";
import { privateError } from "@/lib/http/request";
import { assertPushEncryptionReady } from "@/lib/push/crypto.server";
import { pushVapidPublicKey } from "@/lib/push/delivery.server";
import { deliverPushRecord } from "@/lib/push/records.server";
import { dueReminderDate, dueReminderKinds } from "@/lib/push/schedule";
import {
  pushContractReady,
  pushFeatureEnabled,
  pushPreferencesFromRow,
  type EncryptedSubscriptionRow,
  type PushPreferenceRow,
} from "@/lib/push/server";
import { anyPushReminderEnabled } from "@/lib/push/validation";
import {
  recordServerFailure,
  recordServerFailureReason,
} from "@/lib/observability/server-failures";
import { createAdminSupabase } from "@/lib/supabase/admin.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PREFERENCES = 1000;
const MAX_SUBSCRIPTIONS = 5000;
const MAX_CANDIDATES = 500;
const MAX_CLAIMS = 100;

function schedulerAuthorized(request: Request): boolean {
  const secret = process.env.PUSH_SCHEDULER_SECRET;
  const supplied = request.headers.get("authorization");
  if (!secret || secret.length < 32 || !supplied) return false;
  const expectedDigest = createHash("sha256")
    .update(`Bearer ${secret}`)
    .digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

/** Claims and sends due reminders with idempotency, backoff, and safe metrics. */
export async function POST(request: Request) {
  if (!schedulerAuthorized(request)) return privateError("unauthorized", 401);
  if (!pushFeatureEnabled()) return privateError("unavailable", 503);

  try {
    assertPushEncryptionReady();
    pushVapidPublicKey();
    const admin = createAdminSupabase();
    if (!(await pushContractReady(admin))) {
      recordServerFailureReason("push", "schedule", "schema");
      return privateError("unavailable", 503);
    }
    const now = new Date();
    const nowIso = now.toISOString();
    const { data: rawPreferences, error: preferenceError } = await admin
      .from("push_reminder_preferences")
      .select("*")
      .order("user_id", { ascending: true })
      .limit(MAX_PREFERENCES);
    if (preferenceError) {
      recordServerFailure("push", "schedule", preferenceError);
      return privateError("unavailable", 503);
    }

    const due = (rawPreferences as PushPreferenceRow[])
      .map((row) => {
        const preferences = pushPreferencesFromRow(row);
        const reminderDate = dueReminderDate(now, preferences);
        return {
          row,
          preferences,
          reminderDate,
          kinds: reminderDate
            ? dueReminderKinds(preferences, reminderDate)
            : [],
        };
      })
      .filter(
        (item) =>
          item.reminderDate &&
          anyPushReminderEnabled(item.preferences) &&
          item.kinds.length > 0,
      );
    const userIds = due.map(({ row }) => row.user_id);
    if (userIds.length === 0) {
      await admin.rpc("purge_stale_push_records");
      return Response.json(
        { ok: true, candidates: 0, claimed: 0, sent: 0, failed: 0 },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { data: rawSubscriptions, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select(
        "id,user_id,endpoint_fingerprint,encrypted_subscription,encryption_key_version,expiration_time,transient_failures",
      )
      .in("user_id", userIds)
      .order("id", { ascending: true })
      .limit(MAX_SUBSCRIPTIONS);
    if (subscriptionError) {
      recordServerFailure("push", "schedule", subscriptionError);
      return privateError("unavailable", 503);
    }
    const subscriptions = rawSubscriptions as EncryptedSubscriptionRow[];
    const byUser = new Map<string, EncryptedSubscriptionRow[]>();
    for (const subscription of subscriptions) {
      if (
        subscription.expiration_time &&
        Date.parse(subscription.expiration_time) <= now.getTime()
      ) {
        await admin
          .from("push_subscriptions")
          .delete()
          .eq("id", subscription.id);
        continue;
      }
      const owned = byUser.get(subscription.user_id) ?? [];
      owned.push(subscription);
      byUser.set(subscription.user_id, owned);
    }

    let candidates = 0;
    let claimed = 0;
    let sent = 0;
    let failed = 0;
    for (const item of due) {
      for (const subscription of byUser.get(item.row.user_id) ?? []) {
        for (const kind of item.kinds) {
          if (candidates >= MAX_CANDIDATES || claimed >= MAX_CLAIMS) break;
          candidates += 1;
          const result = await deliverPushRecord(
            admin,
            subscription,
            kind,
            item.reminderDate!,
            nowIso,
          );
          if (!result.claimed) continue;
          claimed += 1;
          if (result.sent) sent += 1;
          else failed += 1;
        }
        if (candidates >= MAX_CANDIDATES || claimed >= MAX_CLAIMS) break;
      }
      if (candidates >= MAX_CANDIDATES || claimed >= MAX_CLAIMS) break;
    }
    await admin.rpc("purge_stale_push_records");
    return Response.json(
      { ok: true, candidates, claimed, sent, failed },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    recordServerFailure("push", "schedule", error);
    return privateError("unavailable", 503);
  }
}
