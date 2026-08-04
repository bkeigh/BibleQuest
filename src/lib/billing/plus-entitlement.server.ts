import "server-only";

import {
  billingStatusFromRows,
  operatorPlusGrantContractReady,
  stripeBillingContractReady,
  type OperatorPlusGrantRow,
  type SubscriptionProjectionRow,
} from "@/lib/billing/server";
import { privateError } from "@/lib/http/request";
import {
  recordServerFailure,
  recordServerFailureReason,
} from "@/lib/observability/server-failures";
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
      // A paying member denied access by an unreadable projection must not be
      // indistinguishable from a member who simply has no entitlement.
      if (!stripeReady || !operatorReady) {
        recordServerFailureReason("billing", "entitlement", "schema");
      } else {
        recordServerFailure(
          "billing",
          "entitlement",
          subscriptions.error ?? grants.error,
        );
      }
      return privateError("unavailable", 503);
    }
    const status = billingStatusFromRows(
      subscriptions.data as SubscriptionProjectionRow[],
      false,
      grants.data as OperatorPlusGrantRow[],
    );
    if (!status.isPlus) return privateError("plus_required", 403);
    return { userId: context.user.id };
  } catch (error) {
    recordServerFailure("billing", "entitlement", error);
    return privateError("unavailable", 503);
  }
}
