import "server-only";

import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  consoleAllowedEmails,
  consoleAuthEnabled,
} from "@/lib/console/auth-config";

export { consoleAllowedEmails, consoleAuthEnabled };

export type ConsoleRole = "owner";

export type ConsoleAccess =
  | {
      state: "authorized";
      userId: string;
      email: string;
      role: ConsoleRole;
    }
  | { state: "unauthenticated" }
  | { state: "forbidden"; email: string | null }
  | { state: "configuration_required" };

type ConsoleAuthConfiguration = {
  enabled?: boolean;
  allowedEmails?: Set<string>;
  supabaseConfigured?: boolean;
};

/** Reports whether the independent operator identity boundary is configured. */
export function isConsoleAuthConfigured({
  enabled = consoleAuthEnabled(),
  allowedEmails = consoleAllowedEmails(),
  supabaseConfigured = isSupabaseConfigured(),
}: ConsoleAuthConfiguration = {}) {
  return (
    enabled &&
    allowedEmails.size > 0 &&
    supabaseConfigured
  );
}

/** Verifies the Supabase session and the independent operator allowlist. */
export async function getConsoleAccess(): Promise<ConsoleAccess> {
  const allowedEmails = consoleAllowedEmails();
  if (!isConsoleAuthConfigured({ allowedEmails })) {
    return { state: "configuration_required" };
  }

  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { state: "unauthenticated" };

    const email = data.user.email?.trim().toLowerCase() ?? null;
    if (!email || !allowedEmails.has(email)) {
      return { state: "forbidden", email };
    }

    return {
      state: "authorized",
      userId: data.user.id,
      email,
      role: "owner",
    };
  } catch {
    return { state: "configuration_required" };
  }
}
