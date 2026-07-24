import { assertPushEncryptionReady } from "@/lib/push/crypto.server";
import { pushVapidPublicKey } from "@/lib/push/delivery.server";
import {
  pushContractReady,
  pushFeatureEnabled,
  pushPreferencesFromRow,
  type PushPreferenceRow,
} from "@/lib/push/server";
import { privateError } from "@/lib/http/request";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Returns only browser-safe VAPID and account preference posture. */
export async function GET() {
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  if (!pushFeatureEnabled()) return privateError("unavailable", 503);
  if (!(await pushContractReady(context.supabase))) {
    return privateError("unavailable", 503);
  }

  try {
    assertPushEncryptionReady();
    const publicKey = pushVapidPublicKey();
    const admin = createAdminSupabase();
    const [preferencesResult, subscriptionsResult] = await Promise.all([
      admin
        .from("push_reminder_preferences")
        .select("*")
        .eq("user_id", context.user.id)
        .maybeSingle(),
      admin
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.user.id),
    ]);
    if (preferencesResult.error || subscriptionsResult.error) {
      return privateError("unavailable", 503);
    }
    return Response.json(
      {
        available: true,
        publicKey,
        preferences: pushPreferencesFromRow(
          preferencesResult.data as PushPreferenceRow | null,
        ),
        preferencesConfigured: Boolean(preferencesResult.data),
        subscriptionCount: subscriptionsResult.count ?? 0,
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return privateError("unavailable", 503);
  }
}
