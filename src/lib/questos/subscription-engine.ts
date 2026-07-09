/**
 * Subscription engine — scaffold only in V1.
 *
 * NON-NEGOTIABLE (Codex, Volume V §4): the free tier is spiritually
 * complete. Nothing in this file may ever gate Bible reading, prayer,
 * reflection, basic quests, or the journey.
 */
import { PLUS_ENTITLEMENT_ID } from "../revenuecat/client";
import type { FeatureKey, PlanKey, SubscriptionState } from "./types";

const PLAN_FEATURES: Record<PlanKey, FeatureKey[]> = {
  free: [],
  plus: [
    "ai_guide",
    "personalized_quests",
    "advanced_reading_plans",
    "premium_themes",
    "voice_journaling",
    "reflection_insights",
    "year_in_review",
    "family_groups",
  ],
  // Patron is support, not access — it carries no spiritual advantage.
  patron: [],
};

export function getSubscription(): SubscriptionState {
  // V1: everyone is a free user. Stripe webhook integration lands here later.
  return { plan: "free", status: "none" };
}

export function hasFeature(feature: FeatureKey): boolean {
  const sub = getSubscription();
  return PLAN_FEATURES[sub.plan].includes(feature);
}

/** Whether a given plan includes a feature — for live (RevenueCat) plan state. */
export function planHasFeature(plan: PlanKey, feature: FeatureKey): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

/**
 * Map a set of active RevenueCat entitlement identifiers to a plan. The
 * "BibleQuest Plus" entitlement grants Plus; everything else is free. (Patron
 * is support, not access — it carries no entitlement, so it stays "free" here.)
 */
export function planFromActiveEntitlements(
  activeEntitlementIds: string[],
): PlanKey {
  return activeEntitlementIds.includes(PLUS_ENTITLEMENT_ID) ? "plus" : "free";
}

export function isCheckoutConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
