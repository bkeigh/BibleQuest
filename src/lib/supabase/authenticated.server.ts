import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { privateError } from "@/lib/http/request";
import { recordServerFailure } from "@/lib/observability/server-failures";
import { createServerSupabase } from "@/lib/supabase/server";

/** Creates an RLS client and verifies the current cookie session with Auth. */
export async function authenticatedServerContext(): Promise<
  { supabase: SupabaseClient; user: User } | Response
> {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return privateError("unauthorized", 401);
    return { supabase, user };
  } catch (error) {
    // Every authenticated route depends on this, so a missing Supabase
    // variable must not read as an ordinary transient outage.
    recordServerFailure("auth", "session", error);
    return privateError("unavailable", 503);
  }
}
