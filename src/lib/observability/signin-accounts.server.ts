import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin.server";
import type { SigninHealthAccount } from "./signin-health";

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
 * Lists account timestamps for the sign-in monitor, over PostgREST.
 *
 * It used to call GoTrue's admin API directly, and that call never once
 * succeeded in production. Three revisions argued about whether a modern
 * secret key belongs on `apikey`, on `Authorization: Bearer`, or on both —
 * and when the response body was finally logged it turned out to be a
 * Cloudflare HTML block page, not a GoTrue error at all. `/auth/v1/admin/*`
 * is refused at the edge from this deployment's egress regardless of headers.
 *
 * PostgREST from the same egress is fine — it is how every other server
 * feature here reaches Supabase — so the monitor reads the two columns it
 * needs through `public.signin_health_accounts()` (migration 0039). That
 * function is `security definer`, granted to service_role alone, and returns
 * timestamps with no identity attached.
 *
 * The judgement stays in `assessSigninHealth`, against a fixed clock.
 */
export async function listSigninAccounts(): Promise<SigninHealthAccount[]> {
  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    throw new SigninAccountsError(
      "configuration",
      "Supabase admin configuration unavailable.",
    );
  }

  const { data, error } = await admin.rpc("signin_health_accounts");

  if (error) {
    // Name it. A blanket "unknown" is what left the original failure
    // undiagnosable for days, and a bare 503 is what kept the next three
    // revisions guessing.
    const code = typeof error.code === "string" ? error.code : "";
    const reason =
      code === "42501" || code === "42883"
        ? "permission"
        : code === "PGRST301" || code === "401"
          ? "auth"
          : "provider";
    console.error(
      JSON.stringify({
        kind: "signin_accounts_failure",
        reason,
        code,
        message: String(error.message ?? "").slice(0, 200),
      }),
    );
    throw new SigninAccountsError(
      reason,
      `Sign-in account read failed (${code || "no code"}).`,
    );
  }

  if (!Array.isArray(data)) {
    throw new SigninAccountsError(
      "provider",
      "Sign-in account read returned no rows.",
    );
  }

  // Keep only the two fields the assessment reads. The function already
  // returns nothing else, and this makes that true at the boundary too.
  return data.map((row: Record<string, unknown>) => ({
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    last_sign_in_at:
      typeof row.last_sign_in_at === "string" ? row.last_sign_in_at : null,
  }));
}
