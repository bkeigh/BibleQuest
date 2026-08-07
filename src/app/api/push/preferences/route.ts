import { boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import {
  pushContractReady,
  pushFeatureEnabled,
  pushPreferencesToRow,
} from "@/lib/push/server";
import {
  MAX_PUSH_REQUEST_BYTES,
  parsePushReminderPreferences,
} from "@/lib/push/validation";
import {
  recordServerFailure,
  recordServerFailureReason,
} from "@/lib/observability/server-failures";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Saves one exact account-wide preference set through the service boundary. */
export async function PATCH(request: Request) {
  if (!pushFeatureEnabled()) return privateError("unavailable", 503);
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext(request);
  if (context instanceof Response) return context;
  if (!(await pushContractReady(context.supabase))) {
    recordServerFailureReason("push", "preferences", "schema");
    return privateError("unavailable", 503);
  }
  const body = await boundedJson(request, MAX_PUSH_REQUEST_BYTES);
  if (body instanceof Response) return body;
  const preferences = parsePushReminderPreferences(body);
  if (!preferences) return privateError("invalid_request", 400);

  try {
    const { error } = await createAdminSupabase()
      .from("push_reminder_preferences")
      .upsert(pushPreferencesToRow(context.user.id, preferences), {
        onConflict: "user_id",
      });
    if (error) {
      recordServerFailure("push", "preferences", error);
      return privateError("unavailable", 503);
    }
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    recordServerFailure("push", "preferences", error);
    return privateError("unavailable", 503);
  }
}
