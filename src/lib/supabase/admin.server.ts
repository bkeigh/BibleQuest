import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey } from "./config";

let adminClient: SupabaseClient | null = null;

/** Creates a server-only client with the independently rotatable secret key. */
export function createAdminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (
    !url ||
    !key ||
    key.length < 32 ||
    key === supabasePublishableKey()
  ) {
    throw new Error("Supabase admin configuration unavailable.");
  }
  adminClient ??= createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return adminClient;
}
