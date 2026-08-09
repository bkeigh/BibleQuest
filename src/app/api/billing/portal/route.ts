import { hasSameOrigin, privateError } from "@/lib/http/request";
import { isNativeAppOrigin } from "@/lib/http/native-origin";
import { requireStripeBillingConfiguration } from "@/lib/billing/config.server";
import {
  claimStripeAction,
  stripeActionRateLimited,
} from "@/lib/billing/records.server";
import { stripeBillingContractReady } from "@/lib/billing/server";
import { createStripe } from "@/lib/billing/stripe.server";
import { recordServerFailure } from "@/lib/observability/server-failures";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Creates a hosted Customer Portal only for the current account mapping. */
export async function POST(request: Request) {
  // App Store builds cannot steer an account into external Stripe management.
  if (isNativeAppOrigin(request)) return privateError("forbidden", 403);
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext(request);
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
      "portal",
      10,
    );
    if (!claim.claimed) return stripeActionRateLimited(10);
    const { data, error } = await admin
      .from("stripe_customers")
      .select("stripe_customer_id,livemode")
      .eq("user_id", context.user.id)
      .maybeSingle();
    if (error) {
      recordServerFailure("billing", "portal", error);
      return privateError("unavailable", 503);
    }
    if (!data) return privateError("not_found", 404);
    if (data.livemode !== configuration.livemode) {
      return privateError("unavailable", 503);
    }
    const portal = await createStripe(
      configuration,
    ).billingPortal.sessions.create(
      {
        customer: data.stripe_customer_id,
        return_url: `${configuration.appOrigin}/app/plus?portal=returned`,
      },
      {
        idempotencyKey: `biblequest-portal-${context.user.id}-${claim.claimToken}`,
      },
    );
    if (new URL(portal.url).origin !== "https://billing.stripe.com") {
      return privateError("unavailable", 503);
    }
    return Response.json(
      { url: portal.url },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    recordServerFailure("billing", "portal", error);
    return privateError("unavailable", 503);
  }
}
