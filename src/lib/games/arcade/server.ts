import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Purchase outcomes that still carry their arcade benefit. */
export const ACTIVE_ARCADE_OUTCOMES = [
  "completed",
  "partially_refunded",
  "dispute_won",
] as const;

export interface ArcadeOrderStatusRow {
  product_key: "question-skip" | "game-pass";
  units_total: number;
  units_consumed: number;
  outcome_status: string;
}

/** Proves the store tables and service-only redemption boundary are installed. */
export async function arcadeStoreContractReady(
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.rpc("arcade_store_contract");
  return (
    !error &&
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).sort().join(",") === "contract,ok" &&
    (data as { contract?: unknown }).contract ===
      "biblequest_arcade_store_v1" &&
    (data as { ok?: unknown }).ok === true
  );
}

/** Reduces sealed order rows to the safe entitlement shape sent to the game. */
export function arcadeStatusFromRows(rows: ArcadeOrderStatusRow[]) {
  let questionSkips = 0;
  let gamePass = false;
  for (const row of rows) {
    if (
      !(ACTIVE_ARCADE_OUTCOMES as readonly string[]).includes(
        row.outcome_status,
      )
    ) {
      continue;
    }
    if (row.product_key === "game-pass") gamePass = true;
    if (row.product_key === "question-skip") {
      questionSkips += Math.max(0, row.units_total - row.units_consumed);
    }
  }
  return { gamePass, questionSkips };
}
