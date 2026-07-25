import { privateError } from "@/lib/http/request";
import { stripeBillingAvailability } from "@/lib/billing/config.server";
import {
  createStripe,
  retrieveBillingPlans,
} from "@/lib/billing/stripe.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Returns current Stripe-authored prices only when purchases are test-enabled. */
export async function GET() {
  const configuration = stripeBillingAvailability();
  if (configuration.status === "coming-soon") {
    return Response.json(
      { availability: "coming-soon", purchasesEnabled: false, plans: [] },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }
  if (configuration.status !== "configured") {
    return privateError("unavailable", 503);
  }
  if (!configuration.purchasesEnabled) {
    return Response.json(
      {
        availability: "configured",
        mode: configuration.mode,
        purchasesEnabled: false,
        plans: [],
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  }

  try {
    const catalog = await retrieveBillingPlans(
      createStripe(configuration),
      configuration,
    );
    return Response.json(
      {
        availability: "configured",
        mode: configuration.mode,
        purchasesEnabled: true,
        plans: [
          {
            interval: "monthly",
            unitAmount: catalog.monthly.unitAmount,
            currency: catalog.monthly.currency,
          },
          {
            interval: "annual",
            unitAmount: catalog.annual.unitAmount,
            currency: catalog.annual.currency,
          },
          {
            interval: "lifetime",
            unitAmount: catalog.lifetime.unitAmount,
            currency: catalog.lifetime.currency,
          },
        ],
      },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch {
    return privateError("unavailable", 503);
  }
}
