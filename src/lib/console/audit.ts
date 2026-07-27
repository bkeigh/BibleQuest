export type ConsoleAuditOutcome = "succeeded" | "denied" | "failed";

export type ConsoleAuditDetails = Record<
  string,
  string | number | boolean
>;

export interface ConsoleAuditEntry {
  id: string;
  operatorEmail: string;
  action: string;
  targetType: string | null;
  targetKey: string | null;
  outcome: ConsoleAuditOutcome;
  details: ConsoleAuditDetails;
  createdAt: string;
}

/** Keeps audit metadata flat, short, and free of arbitrary nested payloads. */
export function sanitizeAuditDetails(
  value: unknown,
): ConsoleAuditDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const details: ConsoleAuditDetails = {};
  for (const [key, detail] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (
      Object.keys(details).length >= 8 ||
      !/^[a-z][a-z0-9_]{0,47}$/.test(key)
    ) {
      continue;
    }
    if (typeof detail === "boolean") details[key] = detail;
    if (
      typeof detail === "number" &&
      Number.isFinite(detail) &&
      Math.abs(detail) <= 1_000_000_000
    ) {
      details[key] = detail;
    }
    if (typeof detail === "string") details[key] = detail.slice(0, 160);
  }
  return details;
}

/** Turns dotted machine actions into calm operator-facing labels. */
export function formatAuditAction(action: string): string {
  return action
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .join(" · ");
}
