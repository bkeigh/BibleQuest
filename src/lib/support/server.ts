import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { stripeBillingAvailability } from "@/lib/billing/config.server";
import { STRIPE_SUPPORT_CONTRACT } from "./config";

function isSupportContract(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === "contract,ok" &&
    (value as { contract?: unknown }).contract === STRIPE_SUPPORT_CONTRACT &&
    (value as { ok?: unknown }).ok === true
  );
}

/** Reports only whether this deployment may show one-time support controls. */
export function stripeSupportAvailability(): {
  enabled: boolean;
  mode: "test" | "live" | null;
} {
  const billing = stripeBillingAvailability();
  return billing.status === "configured"
    ? { enabled: billing.supportEnabled, mode: billing.mode }
    : { enabled: false, mode: null };
}

/** Proves the sealed support migration before any provider session is created. */
export async function stripeSupportContractReady(
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.rpc("stripe_support_contract");
  return !error && isSupportContract(data);
}

/** Returns an optional verified account without making guest support fail. */
export async function optionalSupportUser(
  createClient: () => Promise<SupabaseClient>,
): Promise<User | null> {
  try {
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    return error ? null : user;
  } catch {
    return null;
  }
}
