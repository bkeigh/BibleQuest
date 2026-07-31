import "server-only";

import {
  billingStatusFromRows,
  operatorPlusGrantContractReady,
  stripeBillingContractReady,
  type OperatorPlusGrantRow,
  type SubscriptionProjectionRow,
} from "@/lib/billing/server";
import { privateError } from "@/lib/http/request";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

/** Verifies account identity and Plus access from sealed server records. */
export async function requireServerPlus(): Promise<
  { userId: string } | Response
> {
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  try {
    const admin = createAdminSupabase();
    const [stripeReady, operatorReady, subscriptions, grants] =
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
      grants.error
    ) {
      return privateError("unavailable", 503);
    }
    const status = billingStatusFromRows(
      subscriptions.data as SubscriptionProjectionRow[],
      false,
      grants.data as OperatorPlusGrantRow[],
    );
    if (!status.isPlus) return privateError("plus_required", 403);
    return { userId: context.user.id };
  } catch {
    return privateError("unavailable", 503);
  }
}
