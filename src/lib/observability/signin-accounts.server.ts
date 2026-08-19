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
 * key, because `sb_secret_…` is not a JWT and the auth channel rejects it.
 * That wrapper is correct for PostgREST, but it left this call failing in
 * production with nothing to say beyond "unknown". Here the classes are
 * explicit — modern keys travel as `apikey`, a legacy JWT also as a bearer —
 * and every failure names itself.
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

  const modern = key.startsWith("sb_secret_");
  const headers: Record<string, string> = { apikey: key };
  // A legacy service-role JWT is still accepted in the bearer channel; the
  // modern key is not, which is the whole reason the classes differ here.
  if (!modern) headers.Authorization = `Bearer ${key}`;

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
