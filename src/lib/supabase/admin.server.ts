import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/** Creates the server-only service client used for sealed scheduler records. */
export function createAdminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    !url ||
    !key ||
    key.length < 32 ||
    key === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
