/**
 * Subscription engine — scaffold only in V1.
 *
 * NON-NEGOTIABLE (Codex, Volume V §4): the free tier is spiritually
 * complete. Nothing in this file may ever gate Bible reading, prayer,
 * reflection, basic quests, or the journey.
 */
import { PLUS_ENTITLEMENT_ID } from "../revenuecat/client";
import type { PlanKey } from "./types";

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
