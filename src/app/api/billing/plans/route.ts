import { privateError } from "@/lib/http/request";
import { recordServerFailure } from "@/lib/observability/server-failures";
import { stripeBillingAvailability } from "@/lib/billing/config.server";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";
import {
  distributedPoliciesFromWindows,
  guardDistributedRequest,
} from "@/lib/security/distributed-rate-limit.server";
import {
  createStripe,
  retrieveBillingPlans,
} from "@/lib/billing/stripe.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PLANS_RATE_LIMITS = [
  { limit: 30, windowMs: 60_000 },
  { limit: 180, windowMs: 60 * 60_000 },
] as const;

/** Returns current Stripe prices only after both public request guards pass. */
export async function GET(request: Request) {
  const blocked = guardProviderRequest(
    request,
    "billing-plans",
    PLANS_RATE_LIMITS,
  );
  if (blocked) return blocked;

  const configuration = stripeBillingAvailability();
  if (configuration.status === "coming-soon") {
    return Response.json(
      { availability: "coming-soon", purchasesEnabled: false, plans: [] },
      { headers: { "Cache-Control": "private, no-store" } },
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
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Fail closed before Stripe when the shared abuse-control claim is unavailable.
  const distributedBlocked = await guardDistributedRequest(
    request,
    "billing-plans",
    distributedPoliciesFromWindows(PLANS_RATE_LIMITS),
  );
  if (distributedBlocked) return distributedBlocked;

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
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    recordServerFailure("billing", "plans", error);
    return privateError("unavailable", 503);
  }
}
