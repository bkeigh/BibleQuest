import { stripeBillingAvailability } from "@/lib/billing/config.server";
import { privateError } from "@/lib/http/request";
import {
  arcadeStatusFromRows,
  arcadeStoreContractReady,
  type ArcadeOrderStatusRow,
} from "@/lib/games/arcade/server";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import { authenticatedServerContext } from "@/lib/supabase/authenticated.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Returns only safe arcade ownership and consumable counts for this account. */
export async function GET() {
  const context = await authenticatedServerContext();
  if (context instanceof Response) return context;
  const configuration = stripeBillingAvailability();
  if (configuration.status === "invalid") {
    return privateError("unavailable", 503);
  }
  try {
    const admin = createAdminSupabase();
    if (!(await arcadeStoreContractReady(context.supabase))) {
      return privateError("unavailable", 503);
    }
    const { data, error } = await admin
      .from("arcade_orders")
      .select("product_key,units_total,units_consumed,outcome_status")
      .eq("user_id", context.user.id);
    if (error) return privateError("unavailable", 503);
    return Response.json(
      {
        available:
          configuration.status === "configured" &&
          configuration.arcadeEnabled,
        ...arcadeStatusFromRows(data as ArcadeOrderStatusRow[]),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return privateError("unavailable", 503);
  }
}
