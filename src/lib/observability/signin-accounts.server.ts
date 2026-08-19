import "server-only";

import type { SigninHealthAccount } from "./signin-health";

const PAGE_SIZE = 200;
const MAX_PAGES = 50;

export class SigninAccountsError extends Error {
  constructor(
    readonly reason: "configuration" | "auth" | "permission" | "provider",
    message: string,
  ) {
    super(message);
    this.name = "SigninAccountsError";
  }
}

/**
 * Lists accounts through the Auth admin API, carrying the key the way this
 * codebase already decided each class must be carried.
 *
 * Deliberately not routed through createAdminSupabase: that client installs a
 * fetch wrapper which strips the Authorization header for the modern secret
 * key. That is correct for PostgREST, which rejects a non-JWT bearer — but
 * GoTrue's admin API requires the bearer/apikey PAIR and answers 403 to
 * apikey alone, so the wrapper broke this call with nothing to say beyond
 * "unknown". Here the pair is sent explicitly and every failure names itself.
 */
export async function listSigninAccounts(): Promise<SigninHealthAccount[]> {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!origin || !key || key.length < 32) {
    throw new SigninAccountsError(
      "configuration",
      "Supabase admin configuration unavailable.",
    );
  }

  // Both header channels, identical value, for BOTH key classes. The gateway
  // documents the exception this relies on: a secret key is rejected in the
  // bearer channel "except if the value exactly equals the apikey header".
  // GoTrue's admin API accepts the pair; apikey alone answers 403 — measured
  // in production on 2026-08-19 after the previous revision sent apikey only.
  // (PostgREST is the opposite: it rejects a non-JWT bearer outright, which
  // is why createAdminSupabase strips it there and why this module is
  // deliberately separate from that client.)
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  const accounts: SigninHealthAccount[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetch(
      `${origin}/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`,
      { headers, cache: "no-store" },
    );
    if (response.status === 401) {
      throw new SigninAccountsError("auth", "Admin API rejected the key.");
    }
    if (response.status === 403) {
      throw new SigninAccountsError("permission", "Admin API forbade the key.");
    }
    if (!response.ok) {
      throw new SigninAccountsError(
        "provider",
        `Admin API returned ${response.status}.`,
      );
    }
    const body: unknown = await response.json();
    const users =
      body && typeof body === "object" && Array.isArray((body as { users?: unknown }).users)
        ? ((body as { users: Record<string, unknown>[] }).users)
        : [];
    for (const user of users) {
      accounts.push({
        created_at: typeof user.created_at === "string" ? user.created_at : null,
        last_sign_in_at:
          typeof user.last_sign_in_at === "string" ? user.last_sign_in_at : null,
      });
    }
    if (users.length < PAGE_SIZE) return accounts;
  }
  return accounts;
}
