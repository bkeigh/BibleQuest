import "server-only";

import { recordServerFailure } from "@/lib/observability/server-failures";
import { createAdminSupabase } from "@/lib/supabase/admin.server";
import {
  sanitizeAuditDetails,
  type ConsoleAuditEntry,
  type ConsoleAuditOutcome,
} from "./audit";
import type { ConsoleDataSource } from "./data.server";

interface ConsoleAuditActor {
  userId: string;
  email: string;
}

interface AppendConsoleAuditInput {
  actor: ConsoleAuditActor;
  action: string;
  targetType?: string | null;
  targetKey?: string | null;
  outcome?: ConsoleAuditOutcome;
  details?: unknown;
}

export interface ConsoleAuditResult {
  source: ConsoleDataSource;
  entries: ConsoleAuditEntry[];
  generatedAt: string;
}

const LIVE_SOURCE: ConsoleDataSource = {
  status: "live",
  label: "Append-only production audit records",
};

/** Appends one server-verified operator event and never blocks the main action. */
export async function appendConsoleAuditLog(
  input: AppendConsoleAuditInput,
): Promise<boolean> {
  try {
    const admin = createAdminSupabase();
    const { error } = await admin.rpc("append_console_audit_log", {
      p_operator_user_id: input.actor.userId,
      p_operator_email: input.actor.email,
      p_action: input.action,
      p_target_type: input.targetType ?? null,
      p_target_key: input.targetKey ?? null,
      p_outcome: input.outcome ?? "succeeded",
      p_details: sanitizeAuditDetails(input.details),
    });
    // A dropped operator event leaves the append-only trail incomplete, which
    // no caller can detect later, so the failure is always recorded.
    if (error) recordServerFailure("console", "audit", error);
    return !error;
  } catch (error) {
    recordServerFailure("console", "audit", error);
    return false;
  }
}

/** Loads the latest bounded audit trail without exposing provider payloads. */
export async function loadConsoleAuditLogs(): Promise<ConsoleAuditResult> {
  const generatedAt = new Date().toISOString();
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("console_audit_logs")
      .select(
        "id, operator_email, action, target_type, target_key, outcome, details, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      recordServerFailure("console", "read", error);
      return {
        source: {
          status: "degraded",
          label: "Audit contract unavailable",
        },
        entries: [],
        generatedAt,
      };
    }

    return {
      source: LIVE_SOURCE,
      generatedAt,
      entries: (data ?? []).flatMap((row): ConsoleAuditEntry[] => {
        if (
          typeof row.id !== "string" ||
          typeof row.operator_email !== "string" ||
          typeof row.action !== "string" ||
          !["succeeded", "denied", "failed"].includes(row.outcome) ||
          typeof row.created_at !== "string"
        ) {
          return [];
        }
        return [
          {
            id: row.id,
            operatorEmail: row.operator_email,
            action: row.action,
            targetType:
              typeof row.target_type === "string" ? row.target_type : null,
            targetKey:
              typeof row.target_key === "string" ? row.target_key : null,
            outcome: row.outcome as ConsoleAuditOutcome,
            details: sanitizeAuditDetails(row.details),
            createdAt: row.created_at,
          },
        ];
      }),
    };
  } catch (error) {
    recordServerFailure("console", "read", error);
    return {
      source: {
        status: "setup_required",
        label: "Connect the server operator key to load audit records.",
      },
      entries: [],
      generatedAt,
    };
  }
}
