"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { isConsoleHost } from "@/lib/console/paths";
import { getConsoleAccess } from "@/lib/console/auth.server";
import { appendConsoleAuditLog } from "@/lib/console/audit.server";
import {
  grantOperatorPlusInput,
  revokeOperatorPlusInput,
  type OperatorPlusActionState,
} from "@/lib/console/plus-grants";
import {
  consoleAccountIdentityMatches,
  findConsoleAccountByEmail,
  grantConsolePlus,
  revokeConsolePlus,
} from "@/lib/console/plus-grants.server";

/** Records a newly verified operator session without trusting client identity. */
export async function recordConsoleSignIn() {
  const access = await getConsoleAccess();
  if (access.state !== "authorized") return false;

  // Authorization is fail-closed, but an audit storage outage must not strand
  // an already verified operator outside the recovery console.
  await appendConsoleAuditLog({
    actor: { userId: access.userId, email: access.email },
    action: "operator.sign_in",
    targetType: "console",
    targetKey: "session",
  });
  return true;
}

/** Grants one exact account an audited, bounded manual Plus entitlement. */
export async function grantOperatorPlusAction(
  _previousState: OperatorPlusActionState,
  formData: FormData,
): Promise<OperatorPlusActionState> {
  const access = await getConsoleAccess();
  if (access.state !== "authorized") {
    return {
      status: "error",
      message: "Your operator session is not authorized.",
    };
  }

  const input = grantOperatorPlusInput(formData);
  if (!input) {
    await appendConsoleAuditLog({
      actor: { userId: access.userId, email: access.email },
      action: "entitlement.plus_grant",
      targetType: "account",
      targetKey: "unresolved",
      outcome: "denied",
      details: { error: "invalid_confirmation_or_input" },
    });
    return {
      status: "error",
      message:
        "Enter a valid exact email, matching confirmation, duration, and reason.",
    };
  }

  const target = await findConsoleAccountByEmail(input.email);
  if (!target) {
    await appendConsoleAuditLog({
      actor: { userId: access.userId, email: access.email },
      action: "entitlement.plus_grant",
      targetType: "account",
      targetKey: "unresolved",
      outcome: "denied",
      details: { error: "account_not_found" },
    });
    return {
      status: "error",
      message: "No exact BibleQuest account matches that email.",
    };
  }

  const succeeded = await grantConsolePlus({
    ...input,
    targetUserId: target.id,
    operatorUserId: access.userId,
    operatorEmail: access.email,
  });
  if (!succeeded) {
    await appendConsoleAuditLog({
      actor: { userId: access.userId, email: access.email },
      action: "entitlement.plus_grant",
      targetType: "account",
      targetKey: target.id,
      outcome: "failed",
      details: { error: "mutation_unavailable" },
    });
    return {
      status: "error",
      message: "Plus could not be granted. No entitlement change was saved.",
    };
  }

  revalidatePath("/console/accounts");
  revalidatePath("/accounts");
  return {
    status: "success",
    message: `Plus is now active for ${input.email}.`,
    completedAt: new Date().toISOString(),
  };
}

/** Revokes only an exact account's manual grant after fresh identity checks. */
export async function revokeOperatorPlusAction(
  _previousState: OperatorPlusActionState,
  formData: FormData,
): Promise<OperatorPlusActionState> {
  const access = await getConsoleAccess();
  if (access.state !== "authorized") {
    return {
      status: "error",
      message: "Your operator session is not authorized.",
    };
  }

  const input = revokeOperatorPlusInput(formData);
  if (!input) {
    await appendConsoleAuditLog({
      actor: { userId: access.userId, email: access.email },
      action: "entitlement.plus_revoke",
      targetType: "account",
      targetKey: "unresolved",
      outcome: "denied",
      details: { error: "invalid_confirmation_or_input" },
    });
    return {
      status: "error",
      message:
        "Enter a valid exact email, matching confirmation, and a reason.",
    };
  }

  const target = await findConsoleAccountByEmail(input.email);
  if (
    !target ||
    !(await consoleAccountIdentityMatches(target.id, input.email))
  ) {
    await appendConsoleAuditLog({
      actor: { userId: access.userId, email: access.email },
      action: "entitlement.plus_revoke",
      targetType: "account",
      targetKey: target?.id ?? "unresolved",
      outcome: "denied",
      details: { error: "account_not_found_or_identity_changed" },
    });
    return {
      status: "error",
      message: "No exact BibleQuest account matches that email.",
    };
  }

  const succeeded = await revokeConsolePlus({
    ...input,
    targetUserId: target.id,
    operatorUserId: access.userId,
    operatorEmail: access.email,
  });
  if (!succeeded) {
    await appendConsoleAuditLog({
      actor: { userId: access.userId, email: access.email },
      action: "entitlement.plus_revoke",
      targetType: "account",
      targetKey: target.id,
      outcome: "failed",
      details: { error: "mutation_unavailable" },
    });
    return {
      status: "error",
      message:
        "No active manual Plus grant was revoked. Stripe access was not changed.",
    };
  }

  revalidatePath("/console/accounts");
  revalidatePath("/accounts");
  return {
    status: "success",
    message: `Manual Plus was revoked for ${input.email}.`,
    completedAt: new Date().toISOString(),
  };
}

/** Ends the operator session and returns to the correct sign-in URL. */
export async function signOutConsole() {
  const access = await getConsoleAccess();
  let outcome: "succeeded" | "failed" = "succeeded";

  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) outcome = "failed";
  } catch {
    outcome = "failed";
  }

  if (access.state === "authorized") {
    await appendConsoleAuditLog({
      actor: { userId: access.userId, email: access.email },
      action: "operator.sign_out",
      targetType: "console",
      targetKey: "session",
      outcome,
    });
  }

  const requestHeaders = await headers();
  redirect(
    isConsoleHost(requestHeaders.get("host"))
      ? "/sign-in"
      : "/console/sign-in",
  );
}
