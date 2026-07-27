"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { isConsoleHost } from "@/lib/console/paths";
import { getConsoleAccess } from "@/lib/console/auth.server";
import { appendConsoleAuditLog } from "@/lib/console/audit.server";

/** Records a newly verified operator session without trusting client identity. */
export async function recordConsoleSignIn() {
  const access = await getConsoleAccess();
  if (access.state !== "authorized") return false;

  return appendConsoleAuditLog({
    actor: { userId: access.userId, email: access.email },
    action: "operator.sign_in",
    targetType: "console",
    targetKey: "session",
  });
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
