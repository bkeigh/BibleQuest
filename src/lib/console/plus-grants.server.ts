import "server-only";

import type { User } from "@supabase/supabase-js";
import { operatorPlusGrantContractReady } from "@/lib/billing/server";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import type {
  GrantOperatorPlusInput,
  RevokeOperatorPlusInput,
} from "./plus-grants";

const MAX_AUTH_DIRECTORY_PAGES = 20;
const AUTH_DIRECTORY_PAGE_SIZE = 100;

/** Finds one exact email without exposing an unrestricted auth directory. */
export async function findConsoleAccountByEmail(
  email: string,
): Promise<User | null> {
  const admin = createAdminSupabase();
  for (let page = 1; page <= MAX_AUTH_DIRECTORY_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_DIRECTORY_PAGE_SIZE,
    });
    if (error) return null;
    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    );
    if (match) return match;
    if (data.users.length < AUTH_DIRECTORY_PAGE_SIZE) return null;
  }
  return null;
}

/** Revalidates the account ID and email immediately before revocation. */
export async function consoleAccountIdentityMatches(
  userId: string,
  email: string,
): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  return (
    !error &&
    data.user.email?.trim().toLowerCase() === email.trim().toLowerCase()
  );
}

/** Accepts only the bounded success shape returned by entitlement RPCs. */
function isMutationSuccess(data: unknown, userId: string): boolean {
  return (
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data as { ok?: unknown }).ok === true &&
    (data as { user_id?: unknown }).user_id === userId
  );
}

/** Grants manual Plus and its audit event through one database transaction. */
export async function grantConsolePlus(
  input: GrantOperatorPlusInput & {
    targetUserId: string;
    operatorUserId: string;
    operatorEmail: string;
  },
): Promise<boolean> {
  const admin = createAdminSupabase();
  if (!(await operatorPlusGrantContractReady(admin))) return false;
  const { data, error } = await admin.rpc("grant_operator_plus", {
    p_target_user_id: input.targetUserId,
    p_duration_key: input.duration,
    p_reason: input.reason,
    p_operator_user_id: input.operatorUserId,
    p_operator_email: input.operatorEmail,
  });
  return !error && isMutationSuccess(data, input.targetUserId);
}

/** Revokes manual Plus and its audit event without touching Stripe rows. */
export async function revokeConsolePlus(
  input: RevokeOperatorPlusInput & {
    operatorUserId: string;
    operatorEmail: string;
  },
): Promise<boolean> {
  const admin = createAdminSupabase();
  if (!(await operatorPlusGrantContractReady(admin))) return false;
  const { data, error } = await admin.rpc("revoke_operator_plus", {
    p_target_user_id: input.userId,
    p_reason: input.reason,
    p_operator_user_id: input.operatorUserId,
    p_operator_email: input.operatorEmail,
  });
  return !error && isMutationSuccess(data, input.userId);
}
