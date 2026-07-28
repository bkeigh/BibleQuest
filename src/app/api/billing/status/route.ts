import { privateError } from "@/lib/http/request";
import { stripeBillingAvailability } from "@/lib/billing/config.server";
import {
  billingStatusFromRows,
  operatorPlusGrantContractReady,
  stripeBillingContractReady,
  type OperatorPlusGrantRow,
  type SubscriptionProjectionRow,
} from "@/lib/billing/server";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Returns the server projection only; redirect parameters never grant Plus. */
export async function GET() {
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const configuration = stripeBillingAvailability();
  if (configuration.status === "invalid") {
    return privateError("unavailable", 503);
  }

  try {
    const admin = createAdminSupabase();
    const [stripeReady, operatorReady, subscriptions, customer, grants] =
      await Promise.all([
        stripeBillingContractReady(context.supabase),
        operatorPlusGrantContractReady(admin),
        admin
          .from("subscriptions")
          .select(
            "id,user_id,status,plan_key,current_period_start,current_period_end,billing_interval,currency,cancel_at_period_end,canceled_at,trial_end,synchronized_at",
          )
          .eq("user_id", context.user.id)
          .eq("provider", "stripe"),
        admin
          .from("stripe_customers")
          .select("id", { count: "exact", head: true })
          .eq("user_id", context.user.id),
        admin
          .from("operator_plus_grants")
          .select("id,user_id,starts_at,expires_at,revoked_at")
          .eq("user_id", context.user.id)
          .is("revoked_at", null)
          .limit(2),
      ]);
    if (
      !stripeReady ||
      !operatorReady ||
      subscriptions.error ||
      customer.error ||
      grants.error
    ) {
      return privateError("unavailable", 503);
    }
    return Response.json(
      {
        availability:
          configuration.status === "configured"
            ? "configured"
            : "coming-soon",
        ...(configuration.status === "configured"
          ? { mode: configuration.mode }
          : {}),
        purchasesEnabled:
          configuration.status === "configured" &&
          configuration.purchasesEnabled,
        ...billingStatusFromRows(
          subscriptions.data as SubscriptionProjectionRow[],
          (customer.count ?? 0) > 0,
          grants.data as OperatorPlusGrantRow[],
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return privateError("unavailable", 503);
  }
}
