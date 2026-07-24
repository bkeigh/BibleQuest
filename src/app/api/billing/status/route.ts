import { privateError } from "@/lib/http/request";
import { stripeBillingAvailability } from "@/lib/billing/config.server";
import {
  billingStatusFromRows,
  stripeBillingContractReady,
  type SubscriptionProjectionRow,
} from "@/lib/billing/server";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Returns the server projection only; redirect parameters never grant Plus. */
export async function GET() {
  const configuration = stripeBillingAvailability();
  if (configuration.status === "coming-soon") {
    return Response.json(
      {
        availability: "coming-soon",
        purchasesEnabled: false,
        plan: "free",
        isPlus: false,
        status: "none",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (configuration.status !== "configured") {
    return privateError("unavailable", 503);
  }
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  if (!(await stripeBillingContractReady(context.supabase))) {
    return privateError("unavailable", 503);
  }

  try {
    const admin = createAdminSupabase();
    const [subscriptions, customer] = await Promise.all([
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
    ]);
    if (subscriptions.error || customer.error) {
      return privateError("unavailable", 503);
    }
    return Response.json(
      {
        availability: "configured",
        mode: configuration.mode,
        purchasesEnabled: configuration.purchasesEnabled,
        ...billingStatusFromRows(
          subscriptions.data as SubscriptionProjectionRow[],
          (customer.count ?? 0) > 0,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return privateError("unavailable", 503);
  }
}
