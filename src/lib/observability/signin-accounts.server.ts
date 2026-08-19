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
 * fetch wrapper whose behaviour is tuned for PostgREST, and this call is not
 * PostgREST. Here the key travels the way the platform documents, and a
 * failure says what the upstream actually answered instead of leaving the
 * next person to guess a header shape.
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

  // Publishable and secret keys travel on `apikey` alone. They are not JWTs,
  // so the bearer channel rejects them; the platform's one documented
  // exception — a bearer that exactly equals the apikey header — only means
  // the gateway forwards the request, which is then "rejected as the value is
  // not a JWT". A previous revision read that sentence as permission to send
  // the pair, and it was not. A legacy service-role key IS a JWT and is still
  // carried in both channels, which is what it has always wanted.
  const modern = key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");
  const headers: Record<string, string> = { apikey: key };
  if (!modern) headers.Authorization = `Bearer ${key}`;

  const accounts: SigninHealthAccount[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetch(
      `${origin}/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`,
      { headers, cache: "no-store" },
    );
    if (!response.ok) {
      // Three revisions of this call have now failed on a header theory, each
      // learning only "503". The upstream says which thing is wrong in its
      // body, and that body carries no credential — so record it, bounded,
      // alongside the key CLASS. The key itself never appears.
      await describeAdminRefusal(response, key);
      if (response.status === 401) {
        throw new SigninAccountsError("auth", "Admin API rejected the key.");
      }
      if (response.status === 403) {
        throw new SigninAccountsError("permission", "Admin API forbade the key.");
      }
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

/**
 * Logs why the admin API refused, without ever logging the key.
 *
 * Only the key's class is recorded — the prefix that decides which header
 * shape it wants — because "which class is actually deployed" has been the
 * unknown behind every failure of this call. The upstream body is GoTrue's
 * own error payload (`error_code`, `msg`) and is bounded before it travels.
 */
async function describeAdminRefusal(
  response: Response,
  key: string,
): Promise<void> {
  const keyClass = key.startsWith("sb_secret_")
    ? "sb_secret"
    : key.startsWith("sb_publishable_")
      ? "sb_publishable"
      : key.startsWith("eyJ")
        ? "legacy_jwt"
        : "unrecognised";
  const body = await response.text().catch(() => "");
  console.error(
    JSON.stringify({
      kind: "signin_admin_refusal",
      status: response.status,
      keyClass,
      upstream: body.slice(0, 300),
    }),
  );
}
