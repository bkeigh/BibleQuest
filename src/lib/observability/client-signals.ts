import { apiFetch } from "@/lib/platform/api";

export const CLIENT_SIGNAL_SURFACES = [
  "auth",
  "sync",
  "service_worker",
] as const;
export const CLIENT_SIGNAL_OUTCOMES = ["success", "failure"] as const;
export const CLIENT_SIGNAL_CATEGORIES = [
  "ok",
  "offline",
  "timeout",
  "auth",
  "permission",
  "rate_limited",
  "schema",
  "conflict",
  "provider",
  "configuration",
  "invalid",
  "expired",
  "browser_mismatch",
  "server",
  "worker",
  "unknown",
] as const;

export type ClientSignalSurface = (typeof CLIENT_SIGNAL_SURFACES)[number];
export type ClientSignalOutcome = (typeof CLIENT_SIGNAL_OUTCOMES)[number];
export type ClientSignalCategory = (typeof CLIENT_SIGNAL_CATEGORIES)[number];
export type ClientSignalStage =
  | "session"
  | "request_email"
  | "verify_email"
  | "request_oauth"
  | "callback"
  | "initial"
  | "push"
  | "reconciliation"
  | "registration";

export interface ClientSignal {
  surface: ClientSignalSurface;
  stage: ClientSignalStage;
  outcome: ClientSignalOutcome;
  category: ClientSignalCategory;
  service_worker_version?: string;
}

export interface SafeClientSignalLog extends ClientSignal {
  event: "biblequest_client_signal_v1";
}

const SIGNAL_QUEUE_KEY = "biblequest:operational-signals-v1";
const SIGNAL_QUEUE_CAP = 20;
const SAFE_SERVICE_WORKER_VERSION = /^biblequest-v\d{1,4}$/;

const STAGES_BY_SURFACE: Record<
  ClientSignalSurface,
  readonly ClientSignalStage[]
> = {
  auth: ["session", "request_email", "verify_email", "request_oauth", "callback"],
  sync: ["initial", "push", "reconciliation"],
  service_worker: ["registration"],
};

/** Checks membership without ever reflecting an untrusted candidate. */
function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

/** Accepts only the fixed, content-free cache-version namespace. */
export function isSafeServiceWorkerVersion(value: unknown): value is string {
  return (
    typeof value === "string" && SAFE_SERVICE_WORKER_VERSION.test(value)
  );
}

/** Reconstructs the exact signal schema and drops every unexpected field. */
export function sanitizeClientSignal(candidate: unknown): ClientSignal | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const value = candidate as Record<string, unknown>;
  const keys = Object.keys(value);
  if (
    keys.some(
      (key) =>
        ![
          "surface",
          "stage",
          "outcome",
          "category",
          "service_worker_version",
        ].includes(key),
    )
  ) {
    return null;
  }
  if (
    !includes(CLIENT_SIGNAL_SURFACES, value.surface) ||
    !includes(CLIENT_SIGNAL_OUTCOMES, value.outcome) ||
    !includes(CLIENT_SIGNAL_CATEGORIES, value.category) ||
    !includes(STAGES_BY_SURFACE[value.surface], value.stage)
  ) {
    return null;
  }
  if (
    (value.outcome === "success" && value.category !== "ok") ||
    (value.outcome === "failure" && value.category === "ok")
  ) {
    return null;
  }
  const hasVersion = Object.prototype.hasOwnProperty.call(
    value,
    "service_worker_version",
  );
  if (value.surface === "service_worker") {
    if (
      value.outcome === "success"
        ? !isSafeServiceWorkerVersion(value.service_worker_version)
        : hasVersion
    ) {
      return null;
    }
  } else if (hasVersion) {
    return null;
  }

  return {
    surface: value.surface,
    stage: value.stage,
    outcome: value.outcome,
    category: value.category,
    ...(value.surface === "service_worker" &&
    typeof value.service_worker_version === "string"
      ? { service_worker_version: value.service_worker_version }
      : {}),
  };
}

/** Creates the only structured object the server may write to runtime logs. */
export function safeClientSignalLog(candidate: unknown): SafeClientSignalLog | null {
  const signal = sanitizeClientSignal(candidate);
  return signal ? { event: "biblequest_client_signal_v1", ...signal } : null;
}

interface ErrorShape {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
}

/** Maps raw browser/provider errors to a bounded category without returning text. */
export function classifyOperationalError(
  error: unknown,
  online = typeof navigator === "undefined" || navigator.onLine !== false,
): Exclude<ClientSignalCategory, "ok"> {
  if (!online) return "offline";
  const shape =
    error && typeof error === "object" ? (error as ErrorShape) : ({} as ErrorShape);
  const code = typeof shape.code === "string" ? shape.code.toLowerCase() : "";
  const name = typeof shape.name === "string" ? shape.name.toLowerCase() : "";
  const message =
    typeof shape.message === "string" ? shape.message.toLowerCase() : "";
  const status = typeof shape.status === "number" ? shape.status : 0;

  if (name === "aborterror" || code === "request_timeout") return "timeout";
  if (status === 429 || code.includes("rate_limit")) return "rate_limited";
  if (status === 401 || code.includes("jwt") || code.includes("session")) {
    return "auth";
  }
  if (status === 403 || code === "42501") return "permission";
  if (
    ["42p01", "42703", "pgrst202", "pgrst204", "pgrst205"].includes(code)
  ) {
    return "schema";
  }
  if (status >= 500) return "server";
  if (
    error instanceof TypeError ||
    message.includes("failed to fetch") ||
    message.includes("networkerror")
  ) {
    return "offline";
  }
  return "unknown";
}

/** Revalidates the bounded queue before every read. */
function readSignalQueue(): ClientSignal[] {
  try {
    const raw = window.localStorage.getItem(SIGNAL_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      writeSignalQueue([]);
      return [];
    }
    const safe = parsed
      .map(sanitizeClientSignal)
      .filter((signal): signal is ClientSignal => signal !== null)
      .slice(-SIGNAL_QUEUE_CAP);
    if (JSON.stringify(safe) !== raw) writeSignalQueue(safe);
    return safe;
  } catch {
    writeSignalQueue([]);
    return [];
  }
}

/** Persists only reconstructed enums and drops the queue when storage fails. */
function writeSignalQueue(queue: ClientSignal[]): void {
  try {
    const safe = queue
      .map(sanitizeClientSignal)
      .filter((signal): signal is ClientSignal => signal !== null)
      .slice(-SIGNAL_QUEUE_CAP);
    if (safe.length) {
      window.localStorage.setItem(SIGNAL_QUEUE_KEY, JSON.stringify(safe));
    } else {
      window.localStorage.removeItem(SIGNAL_QUEUE_KEY);
    }
  } catch {
    // Operational signals remain best effort when storage is unavailable.
  }
}

/** Sends one validated signal without cookies or referrer information. */
async function sendClientSignal(signal: ClientSignal): Promise<boolean> {
  try {
    const response = await apiFetch("/api/observability/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
      cache: "no-store",
      credentials: "omit",
      keepalive: true,
      referrerPolicy: "no-referrer",
    });
    return response.ok || (response.status >= 400 && response.status < 500);
  } catch {
    return false;
  }
}

let flushPromise: Promise<void> | null = null;
let onlineListenerReady = false;

/** Flushes queued enum-only signals in order and stops at the first outage. */
export function flushClientSignals(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    for (;;) {
      const queue = readSignalQueue();
      const head = queue[0];
      if (!head) return;
      if (!(await sendClientSignal(head))) return;
      writeSignalQueue(readSignalQueue().slice(1));
    }
  })().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

/** Installs one reconnect listener after operational reporting first activates. */
function ensureOnlineListener(): void {
  if (onlineListenerReady || typeof window === "undefined") return;
  window.addEventListener("online", () => void flushClientSignals());
  onlineListenerReady = true;
}

/** Queues a validated signal locally, then attempts a content-free flush. */
export function reportClientSignal(candidate: ClientSignal): void {
  const signal = sanitizeClientSignal(candidate);
  if (!signal || typeof window === "undefined") return;
  ensureOnlineListener();
  writeSignalQueue([...readSignalQueue(), signal]);
  void flushClientSignals();
}
