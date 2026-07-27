import "server-only";

import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import { accountSyncAvailable } from "@/lib/sync/containment";

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

/** Reports whether production has both identity and authorization configured. */
export function isConsoleAuthConfigured() {
  return (
    consoleAllowedEmails().size > 0 &&
    accountSyncAvailable(isSupabaseConfigured())
  );
}

/** Verifies the Supabase session and the independent operator allowlist. */
export async function getConsoleAccess(): Promise<ConsoleAccess> {
  const allowedEmails = consoleAllowedEmails();
  if (
    allowedEmails.size === 0 ||
    !accountSyncAvailable(isSupabaseConfigured())
  ) {
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
