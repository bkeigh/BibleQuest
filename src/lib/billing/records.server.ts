import "server-only";

import type Stripe from "stripe";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { StripeBillingConfiguration } from "./config.server";
import {
  subscriptionProjection,
  type StripeCustomerRow,
} from "./server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ActionClaim {
  claimed: boolean;
  claimToken?: string;
}

function parseActionClaim(value: unknown): ActionClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stripe action claim unavailable.");
  }
  const result = value as { claimed?: unknown; claim_token?: unknown };
  if (result.claimed === false) return { claimed: false };
  if (result.claimed !== true || !UUID.test(String(result.claim_token))) {
    throw new Error("Stripe action claim unavailable.");
  }
  return { claimed: true, claimToken: String(result.claim_token) };
}

/** Claims one bounded checkout, portal, or refresh action for an account. */
export async function claimStripeAction(
  admin: SupabaseClient,
  userId: string,
  action: "checkout" | "portal" | "refresh",
  minimumSeconds: number,
): Promise<ActionClaim> {
  const { data, error } = await admin.rpc("claim_stripe_action", {
    p_user_id: userId,
    p_action: action,
    p_minimum_seconds: minimumSeconds,
  });
  if (error) throw new Error("Stripe action claim unavailable.");
  return parseActionClaim(data);
}

/** Finds or idempotently creates the one Stripe Customer for an account. */
export async function customerForUser(
  admin: SupabaseClient,
  stripe: Stripe,
  user: User,
  configuration: StripeBillingConfiguration,
): Promise<string> {
  const { data: existing, error: lookupError } = await admin
    .from("stripe_customers")
    .select("user_id,stripe_customer_id,livemode")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupError) throw new Error("Stripe customer unavailable.");
  if (existing) {
    const row = existing as StripeCustomerRow;
    if (row.livemode !== configuration.livemode) {
      throw new Error("Stripe customer unavailable.");
    }
    return row.stripe_customer_id;
  }

  const customer = await stripe.customers.create(
    {
      ...(user.email ? { email: user.email } : {}),
      metadata: {
        biblequest_user_id: user.id,
        purpose: "biblequest_plus",
      },
    },
    { idempotencyKey: `biblequest-customer-${user.id}` },
  );
  if (customer.livemode !== configuration.livemode) {
    throw new Error("Stripe customer unavailable.");
  }
  const { error } = await admin.from("stripe_customers").upsert(
    {
      user_id: user.id,
      stripe_customer_id: customer.id,
      livemode: customer.livemode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_customer_id" },
  );
  if (error) throw new Error("Stripe customer unavailable.");
  return customer.id;
}

/** Resolves the application owner from the sealed Customer mapping. */
export async function userForStripeCustomer(
  admin: SupabaseClient,
  customerId: string,
  livemode: boolean,
): Promise<string | null> {
  const { data, error } = await admin
    .from("stripe_customers")
    .select("user_id,livemode")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error("Stripe customer mapping unavailable.");
  if (!data) return null;
  if (data.livemode !== livemode) {
    throw new Error("Stripe customer mapping unavailable.");
  }
  return typeof data.user_id === "string" ? data.user_id : null;
}

/** Upserts the current authoritative subscription by Stripe object ID. */
export async function synchronizeSubscription(
  admin: SupabaseClient,
  subscription: Stripe.Subscription,
  configuration: StripeBillingConfiguration,
  event?: Pick<Stripe.Event, "id" | "created">,
): Promise<void> {
  if (subscription.livemode !== configuration.livemode) {
    throw new Error("Stripe subscription mode mismatch.");
  }
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const userId = await userForStripeCustomer(
    admin,
    customerId,
    subscription.livemode,
  );
  const projection = subscriptionProjection(
    subscription,
    userId,
    configuration,
    event,
  );
  const { error } = await admin.from("subscriptions").upsert(projection, {
    onConflict: "external_subscription_id",
  });
  if (error) throw new Error("Stripe subscription projection unavailable.");
}

/** Reconciles every current Stripe subscription for one mapped customer. */
export async function refreshUserSubscriptions(
  admin: SupabaseClient,
  stripe: Stripe,
  customerId: string,
  configuration: StripeBillingConfiguration,
): Promise<number> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  for (const subscription of subscriptions.data) {
    await synchronizeSubscription(
      admin,
      subscription,
      configuration,
    );
  }
  return subscriptions.data.length;
}
