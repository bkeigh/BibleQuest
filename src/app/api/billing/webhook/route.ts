import { boundedText } from "@/lib/http/json";
import { privateError } from "@/lib/http/request";
import { requireStripeBillingConfiguration } from "@/lib/billing/config.server";
import { stripeBillingContractReady } from "@/lib/billing/server";
import { createStripe } from "@/lib/billing/stripe.server";
import {
  processStripeWebhookEvent,
  StripeWebhookProcessingError,
} from "@/lib/billing/webhook.server";
import { createAdminSupabase } from "@/lib/supabase/admin.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_STRIPE_WEBHOOK_BYTES = 256 * 1024;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WebhookClaim =
  | { status: "claimed"; token: string }
  | { status: "processed" }
  | { status: "unavailable" };

function webhookClaim(value: unknown): WebhookClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "unavailable" };
  }
  const result = value as {
    claimed?: unknown;
    claim_token?: unknown;
    status?: unknown;
  };
  if (result.claimed === false) {
    return result.status === "processed"
      ? { status: "processed" }
      : { status: "unavailable" };
  }
  if (
    result.claimed === true &&
    UUID.test(String(result.claim_token))
  ) {
    return { status: "claimed", token: String(result.claim_token) };
  }
  return { status: "unavailable" };
}

/** Verifies, claims, rehydrates, and projects one replay-safe Stripe event. */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  const signature = request.headers.get("stripe-signature");
  if (
    !signature ||
    signature.length > 8192 ||
    !Number.isFinite(declared) ||
    declared < 0 ||
    declared > MAX_STRIPE_WEBHOOK_BYTES
  ) {
    return privateError("invalid_request", 400);
  }

  let event;
  let configuration;
  let stripe;
  try {
    const raw = await boundedText(request, MAX_STRIPE_WEBHOOK_BYTES);
    if (raw instanceof Response) return raw;
    configuration = requireStripeBillingConfiguration();
    stripe = createStripe(configuration);
    event = stripe.webhooks.constructEvent(
      raw,
      signature,
      configuration.webhookSecret,
    );
    if (event.livemode !== configuration.livemode) {
      return privateError("invalid_request", 400);
    }
  } catch {
    return privateError("invalid_request", 400);
  }

  let admin;
  let data;
  let error;
  try {
    admin = createAdminSupabase();
    if (!(await stripeBillingContractReady(admin))) {
      return privateError("unavailable", 503);
    }
    ({ data, error } = await admin.rpc("claim_stripe_webhook_event", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_created: event.created,
      p_livemode: event.livemode,
    }));
  } catch {
    return privateError("unavailable", 503);
  }
  const claim = error
    ? { status: "unavailable" as const }
    : webhookClaim(data);
  if (claim.status === "processed") {
    return Response.json(
      { received: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (claim.status !== "claimed") return privateError("unavailable", 503);

  try {
    const outcome = await processStripeWebhookEvent(
      admin,
      stripe,
      configuration,
      event,
    );
    const { data: completed, error: completionError } = await admin.rpc(
      "complete_stripe_webhook_event",
      {
        p_event_id: event.id,
        p_claim_token: claim.token,
        p_outcome: "processed",
        p_error_category: outcome === "ignored" ? "ignored" : null,
      },
    );
    if (completionError || completed !== true) {
      return privateError("unavailable", 503);
    }
    return Response.json(
      { received: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (processingError) {
    const category =
      processingError instanceof StripeWebhookProcessingError
        ? processingError.category
        : "invalid";
    await admin.rpc("complete_stripe_webhook_event", {
      p_event_id: event.id,
      p_claim_token: claim.token,
      p_outcome: "failed",
      p_error_category: category,
    });
    return privateError("unavailable", 503);
  }
}
