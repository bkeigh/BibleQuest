import { hasSameOrigin, privateError } from "@/lib/http/request";
import { requireStripeBillingConfiguration } from "@/lib/billing/config.server";
import {
  claimStripeAction,
  mappedStripeCustomerForUser,
  stripeBillingPortalUrl,
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
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const context = await authenticatedServerContext(request);
  if (context instanceof Response) return context;

  // The route has a zero-byte contract, so no caller can select Customer,
  // return, mode, flow, or Portal configuration parameters.
  if (
    request.body !== null ||
    ![null, "0"].includes(request.headers.get("content-length"))
  ) {
    return privateError("invalid_request", 400);
  }

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
    const customerId = await mappedStripeCustomerForUser(
      admin,
      context.user.id,
      configuration.livemode,
    );
    if (!customerId) return privateError("not_found", 404);

    const returnUrl = `${configuration.appOrigin}/app/plus?portal=returned`;
    const portal = await createStripe(
      configuration,
    ).billingPortal.sessions.create(
      {
        customer: customerId,
        return_url: returnUrl,
      },
      {
        idempotencyKey: `biblequest-portal-${context.user.id}-${claim.claimToken}`,
      },
    );
    const portalUrl = stripeBillingPortalUrl(portal, {
      customerId,
      livemode: configuration.livemode,
      returnUrl,
    });
    if (!portalUrl) return privateError("unavailable", 503);
    return Response.json(
      { url: portalUrl },
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
