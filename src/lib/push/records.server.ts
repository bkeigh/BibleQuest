import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordServerFailure } from "@/lib/observability/server-failures";
import { decryptPushSubscription } from "./crypto.server";
import { sendNeutralPush } from "./delivery.server";
import type { EncryptedSubscriptionRow } from "./server";
import type { PushReminderKind } from "./validation";

interface DeliveryClaim {
  claimed: boolean;
  deliveryId?: string;
  claimToken?: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseClaim(value: unknown): DeliveryClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Push delivery claim unavailable.");
  }
  const result = value as {
    claimed?: unknown;
    delivery_id?: unknown;
    claim_token?: unknown;
  };
  if (result.claimed === false) return { claimed: false };
  if (
    result.claimed !== true ||
    !UUID.test(String(result.delivery_id)) ||
    !UUID.test(String(result.claim_token))
  ) {
    throw new Error("Push delivery claim unavailable.");
  }
  return {
    claimed: true,
    deliveryId: String(result.delivery_id),
    claimToken: String(result.claim_token),
  };
}

/** Claims, sends, and completes one idempotent neutral delivery record. */
export async function deliverPushRecord(
  admin: SupabaseClient,
  subscription: EncryptedSubscriptionRow,
  kind: PushReminderKind | "test",
  reminderDate: string,
  scheduledFor: string,
): Promise<{ claimed: boolean; sent: boolean }> {
  const { data, error } = await admin.rpc("claim_push_delivery", {
    p_subscription_id: subscription.id,
    p_user_id: subscription.user_id,
    p_reminder_kind: kind,
    p_reminder_date: reminderDate,
    p_scheduled_for: scheduledFor,
  });
  if (error) {
    throw new Error("Push delivery claim unavailable.", { cause: error });
  }
  const claim = parseClaim(data);
  if (!claim.claimed) return { claimed: false, sent: false };

  let outcome: Awaited<ReturnType<typeof sendNeutralPush>>;
  try {
    const decrypted = decryptPushSubscription(
      subscription.encrypted_subscription,
      subscription.encryption_key_version,
      subscription.endpoint_fingerprint,
    );
    outcome = await sendNeutralPush(decrypted, kind);
  } catch (error) {
    // This branch also permanently deletes the subscription, so a rotated key
    // or misconfigured provider must not silently unsubscribe accounts.
    recordServerFailure("push", "deliver", error);
    outcome = {
      outcome: "permanent_failure",
      statusCodeClass: null,
      category: "invalid",
      retryAfterSeconds: 300,
      removeSubscription: true,
    };
  }

  const { data: completed, error: completionError } = await admin.rpc(
    "complete_push_delivery",
    {
      p_delivery_id: claim.deliveryId!,
      p_claim_token: claim.claimToken!,
      p_outcome: outcome.outcome,
      p_status_code_class: outcome.statusCodeClass,
      p_category: outcome.category,
      p_retry_after_seconds: outcome.retryAfterSeconds,
    },
  );
  if (completionError || completed !== true) {
    throw new Error("Push delivery completion unavailable.", {
      cause: completionError,
    });
  }
  return {
    claimed: true,
    sent: outcome.outcome === "sent",
  };
}
