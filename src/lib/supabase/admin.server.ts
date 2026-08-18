import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey } from "./config";

let adminClient: SupabaseClient | null = null;

/** Removes the modern server key from the JWT authorization channel. */
function secretKeyFetch(secretKey: string): typeof fetch {
  return (input, init = {}) => {
    const headers = new Headers(
      init.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (headers.get("authorization") === `Bearer ${secretKey}`) {
      headers.delete("authorization");
    }
    return fetch(input, { ...init, headers });
  };
}

/** Creates a server-only client with the independently rotatable secret key. */
export function createAdminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const modernSecret = process.env.SUPABASE_SECRET_KEY?.trim();
  const key =
    modernSecret ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (
    !url ||
    !key ||
    key.length < 32 ||
    (modernSecret !== undefined && !modernSecret.startsWith("sb_secret_")) ||
    key === supabasePublishableKey()
  ) {
    throw new Error("Supabase admin configuration unavailable.");
  }
  adminClient ??= createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(modernSecret
      ? { global: { fetch: secretKeyFetch(modernSecret) } }
      : {}),
  });
  return adminClient;
}
