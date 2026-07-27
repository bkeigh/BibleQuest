import "server-only";

import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Requires an exact server-only rollout value so the private console fails closed. */
export function consoleAuthEnabled(
  raw = process.env.BIBLEQUEST_CONSOLE_AUTH_ENABLED,
): boolean {
  return raw === "true";
}

/** Parses the server-only operator allowlist and rejects malformed entries. */
export function consoleAllowedEmails(
  raw = process.env.BIBLEQUEST_CONSOLE_ALLOWED_EMAILS,
): Set<string> {
  if (!raw) return new Set();

  const emails = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length <= 254 && EMAIL.test(email));

  return new Set(emails.slice(0, 20));
}

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
