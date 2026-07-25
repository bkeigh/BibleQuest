import "server-only";

import {
  stripeBillingAvailability as parseStripeBillingAvailability,
  type StripeBillingAvailability,
  type StripeBillingConfiguration,
} from "./config";
export type {
  StripeBillingAvailability,
  StripeBillingConfiguration,
  StripeBillingMode,
} from "./config";

/** Reads the full Stripe gate only inside a server module. */
export function stripeBillingAvailability(
  env: NodeJS.ProcessEnv = process.env,
): StripeBillingAvailability {
  return parseStripeBillingAvailability(env);
}

/** Requires a complete test/live gate for any Stripe API mutation or read. */
export function requireStripeBillingConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): StripeBillingConfiguration {
  const availability = parseStripeBillingAvailability(env);
  if (availability.status !== "configured") {
    throw new Error("Stripe billing configuration unavailable.");
  }
  return availability;
}
