import "server-only";

/**
 * Server routes answer provider, database, and configuration failures with one
 * bounded private error so nothing about an account or a dependency leaks to a
 * caller. Without a matching log line those branches are also invisible to the
 * operator: a missing deployment variable and a database outage both read as a
 * silent 503. This records why a surface failed using the same single-JSON-line
 * shape as `ai_failure` and the client signal route, so every operational log
 * stays in one stream and still contains only fixed enums.
 */

export const SERVER_FAILURE_SURFACES = [
  "billing",
  "billing_webhook",
  "support",
  "push",
  "avatar",
  "bible",
  "rate_limit",
  "console",
  "auth",
  "unknown",
] as const;

export const SERVER_FAILURE_STAGES = [
  "checkout",
  "plans",
  "portal",
  "refresh",
  "status",
  "verify",
  "claim",
  "process",
  "complete",
  "config",
  "preferences",
  "schedule",
  "session",
  "audit",
  "entitlement",
  "deliver",
  "subscribe",
  "unsubscribe",
  "test_delivery",
  "read",
  "write",
  "delete",
  "translations",
  "passage",
  "chapter",
  "view_report",
  "unknown",
] as const;

export const SERVER_FAILURE_REASONS = [
  "configuration",
  "timeout",
  "rate_limited",
  "auth",
  "permission",
  "schema",
  "conflict",
  "provider",
  "dependency",
  "invalid",
  "unknown",
] as const;

export type ServerFailureSurface = (typeof SERVER_FAILURE_SURFACES)[number];
export type ServerFailureStage = (typeof SERVER_FAILURE_STAGES)[number];
export type ServerFailureReason = (typeof SERVER_FAILURE_REASONS)[number];

export interface SafeServerFailureLog {
  kind: "server_failure";
  surface: ServerFailureSurface;
  stage: ServerFailureStage;
  reason: ServerFailureReason;
}

/** Checks membership without ever reflecting an untrusted candidate. */
function includes<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

interface ErrorShape {
  reason?: unknown;
  cause?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

/**
 * Maps one raw provider, database, or configuration error to a bounded reason.
 * The error's own text is only inspected here; it is never part of the result.
 */
export function classifyServerFailure(
  error: unknown,
  depth = 0,
): ServerFailureReason {
  const shape =
    error && typeof error === "object"
      ? (error as ErrorShape)
      : ({} as ErrorShape);
  const code = typeof shape.code === "string" ? shape.code.toLowerCase() : "";
  const name = typeof shape.name === "string" ? shape.name.toLowerCase() : "";
  const message =
    typeof shape.message === "string" ? shape.message.toLowerCase() : "";
  const status =
    typeof shape.status === "number"
      ? shape.status
      : typeof shape.statusCode === "number"
        ? shape.statusCode
        : 0;

  // A reviewed error may already carry one of these bounded reasons.
  if (includes(SERVER_FAILURE_REASONS, shape.reason)) return shape.reason;
  if (name.includes("configurationerror") || code === "econnrefused") {
    return "configuration";
  }
  if (
    name === "aborterror" ||
    name === "timeouterror" ||
    name === "deadlineerror" ||
    code === "etimedout" ||
    code === "request_timeout"
  ) {
    return "timeout";
  }
  if (status === 429 || code.includes("rate_limit")) return "rate_limited";
  if (status === 401 || code.includes("jwt") || code.includes("session")) {
    return "auth";
  }
  if (status === 403 || code === "42501") return "permission";
  if (["42p01", "42703", "pgrst202", "pgrst204", "pgrst205"].includes(code)) {
    return "schema";
  }
  if (name.includes("conflicterror") || status === 409) return "conflict";
  if (status >= 500) return "provider";
  if (status >= 400) return "invalid";
  if (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("networkerror")
  ) {
    return "dependency";
  }
  // A wrapper thrown to keep provider text out of a caller still carries the
  // classifiable failure as its cause.
  return shape.cause && depth < 3
    ? classifyServerFailure(shape.cause, depth + 1)
    : "unknown";
}

/** Reconstructs the only failure object a route may write to runtime logs. */
export function safeServerFailureLog(
  surface: unknown,
  stage: unknown,
  reason: unknown,
): SafeServerFailureLog {
  return {
    kind: "server_failure",
    surface: includes(SERVER_FAILURE_SURFACES, surface) ? surface : "unknown",
    stage: includes(SERVER_FAILURE_STAGES, stage) ? stage : "unknown",
    reason: includes(SERVER_FAILURE_REASONS, reason) ? reason : "unknown",
  };
}

/** Records an already bounded reason, such as a reviewed webhook category. */
export function recordServerFailureReason(
  surface: ServerFailureSurface,
  stage: ServerFailureStage,
  reason: ServerFailureReason,
): void {
  console.error(JSON.stringify(safeServerFailureLog(surface, stage, reason)));
}

/** Records why one server surface answered with a bounded private error. */
export function recordServerFailure(
  surface: ServerFailureSurface,
  stage: ServerFailureStage,
  error: unknown,
): void {
  recordServerFailureReason(surface, stage, classifyServerFailure(error));
}
