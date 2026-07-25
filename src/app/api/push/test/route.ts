import { boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import { pushEndpointFingerprint } from "@/lib/push/crypto.server";
import { deliverPushRecord } from "@/lib/push/records.server";
import {
  pushContractReady,
  pushFeatureEnabled,
  type EncryptedSubscriptionRow,
} from "@/lib/push/server";
import {
  isValidPushEndpoint,
  MAX_PUSH_REQUEST_BYTES,
} from "@/lib/push/validation";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Sends one throttled, content-free notification to the requesting browser. */
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
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).join(",") !== "endpoint" ||
    !isValidPushEndpoint((body as { endpoint?: unknown }).endpoint)
  ) {
    return privateError("invalid_request", 400);
  }

  try {
    const endpoint = (body as { endpoint: string }).endpoint;
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("push_subscriptions")
      .select(
        "id,user_id,endpoint_fingerprint,encrypted_subscription,encryption_key_version,expiration_time,transient_failures",
      )
      .eq("user_id", context.user.id)
      .eq("endpoint_fingerprint", pushEndpointFingerprint(endpoint))
      .maybeSingle();
    if (error || !data) return privateError("not_found", 404);

    const { data: claim, error: claimError } = await admin.rpc(
      "claim_push_test",
      { p_user_id: context.user.id },
    );
    if (claimError || !claim || typeof claim !== "object") {
      return privateError("unavailable", 503);
    }
    if ((claim as { claimed?: unknown }).claimed !== true) {
      return Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "300",
          },
        },
      );
    }

    const result = await deliverPushRecord(
      admin,
      data as EncryptedSubscriptionRow,
      "test",
      new Date().toISOString().slice(0, 10),
      new Date().toISOString(),
    );
    return result.sent
      ? new Response(null, {
          status: 204,
          headers: { "Cache-Control": "private, no-store" },
        })
      : privateError("delivery_failed", 503);
  } catch {
    return privateError("delivery_failed", 503);
  }
}
