import { hasSameOrigin, privateError } from "@/lib/http/request";
import { requireStripeBillingConfiguration } from "@/lib/billing/config.server";
import {
  claimStripeAction,
  refreshUserSubscriptions,
  stripeActionRateLimited,
} from "@/lib/billing/records.server";
import { stripeBillingContractReady } from "@/lib/billing/server";
import { createStripe } from "@/lib/billing/stripe.server";
import { recordServerFailure } from "@/lib/observability/server-failures";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reconciles current Stripe objects after Checkout or Portal return. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;

  try {
    const configuration = requireStripeBillingConfiguration();
    if (!(await stripeBillingContractReady(context.supabase))) {
      return privateError("unavailable", 503);
    }
    const admin = createAdminSupabase();
    const claim = await claimStripeAction(
      admin,
      context.user.id,
      "refresh",
      10,
    );
    if (!claim.claimed) return stripeActionRateLimited(10);
    const { data, error } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id,livemode")
      .eq("user_id", context.user.id)
      .maybeSingle();
    if (error) {
      recordServerFailure("billing", "refresh", error);
      return privateError("unavailable", 503);
    }
    if (!data) {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (data.livemode !== configuration.livemode) {
      return privateError("unavailable", 503);
    }
    await refreshUserSubscriptions(
      admin,
      createStripe(configuration),
      data.stripe_customer_id,
      configuration,
    );
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    recordServerFailure("billing", "refresh", error);
    return privateError("unavailable", 503);
  }
}
