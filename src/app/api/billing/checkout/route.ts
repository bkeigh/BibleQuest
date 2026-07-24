import { boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import { requireStripeBillingConfiguration } from "@/lib/billing/config.server";
import {
  claimStripeAction,
  customerForUser,
} from "@/lib/billing/records.server";
import { stripeBillingContractReady } from "@/lib/billing/server";
import {
  createStripe,
  retrieveBillingPlans,
} from "@/lib/billing/stripe.server";
import {
  isBillingInterval,
  MAX_BILLING_REQUEST_BYTES,
} from "@/lib/billing/validation";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Creates one server-allowlisted hosted subscription Checkout Session. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const body = await boundedJson(request, MAX_BILLING_REQUEST_BYTES);
  if (body instanceof Response) return body;
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).join(",") !== "interval" ||
    !isBillingInterval((body as { interval?: unknown }).interval)
  ) {
    return privateError("invalid_request", 400);
  }

  try {
    const configuration = requireStripeBillingConfiguration();
    if (!configuration.purchasesEnabled) {
      return privateError("unavailable", 503);
    }
    if (!(await stripeBillingContractReady(context.supabase))) {
      return privateError("unavailable", 503);
    }
    const admin = createAdminSupabase();
    const claim = await claimStripeAction(
      admin,
      context.user.id,
      "checkout",
      30,
    );
    if (!claim.claimed) {
      return Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "30",
          },
        },
      );
    }
    const { count, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.user.id)
      .eq("provider", "stripe")
      .in("status", [
        "incomplete",
        "trialing",
        "active",
        "past_due",
        "unpaid",
        "paused",
      ]);
    if (subscriptionError) return privateError("unavailable", 503);
    if ((count ?? 0) > 0) return privateError("manage_existing", 409);

    const stripe = createStripe(configuration);
    const interval = (body as { interval: "monthly" | "annual" }).interval;
    const plans = await retrieveBillingPlans(stripe, configuration);
    const customer = await customerForUser(
      admin,
      stripe,
      context.user,
      configuration,
    );
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: context.user.id,
        line_items: [{ price: plans[interval].priceId, quantity: 1 }],
        success_url: `${configuration.appOrigin}/app/plus?checkout=returned`,
        cancel_url: `${configuration.appOrigin}/app/plus?checkout=cancelled`,
        metadata: {
          purpose: "biblequest_plus",
          biblequest_user_id: context.user.id,
          billing_interval: interval,
        },
        subscription_data: {
          metadata: {
            purpose: "biblequest_plus",
            biblequest_user_id: context.user.id,
            billing_interval: interval,
          },
        },
      },
      {
        idempotencyKey: `biblequest-checkout-${context.user.id}-${interval}-${claim.claimToken}`,
      },
    );
    if (
      !session.url ||
      new URL(session.url).origin !== "https://checkout.stripe.com"
    ) {
      return privateError("unavailable", 503);
    }
    return Response.json(
      { url: session.url },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return privateError("unavailable", 503);
  }
}
