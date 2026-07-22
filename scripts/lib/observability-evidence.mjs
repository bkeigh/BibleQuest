import { readFileSync } from "node:fs";

const observability = JSON.parse(
  readFileSync(
    new URL("../../config/observability.json", import.meta.url),
    "utf8",
  ),
);

const SURFACES = ["auth", "sync", "service_worker"];
const OUTCOMES = ["success", "failure"];
const CATEGORIES = [
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
];
const STAGES = {
  auth: ["session", "request_email", "request_oauth", "callback"],
  sync: ["initial", "push"],
  service_worker: ["registration"],
};

export const DAILY_QUEST_SYNC_CONTRACT = "biblequest_daily_quest_sync_v1";

/** Accepts only the two-field public CAS posture response. */
export function isDailyQuestSyncContract(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    Object.keys(value).sort().join(",") === "contract,ok" &&
    value.contract === DAILY_QUEST_SYNC_CONTRACT &&
    value.ok === true
  );
}

/** Parses one exact structured log message and drops every other field. */
export function parseClientSignalMessage(message) {
  if (typeof message !== "string" || message.length > 1_024) return null;
  let value;
  try {
    value = JSON.parse(message);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.some(
      (key) =>
        ![
          "event",
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
    value.event !== "biblequest_client_signal_v1" ||
    !SURFACES.includes(value.surface) ||
    !OUTCOMES.includes(value.outcome) ||
    !CATEGORIES.includes(value.category) ||
    !STAGES[value.surface].includes(value.stage) ||
    (value.outcome === "success" && value.category !== "ok") ||
    (value.outcome === "failure" && value.category === "ok")
  ) {
    return null;
  }
  const hasVersion = Object.prototype.hasOwnProperty.call(
    value,
    "service_worker_version",
  );
  if (
    value.surface === "service_worker"
      ? value.outcome === "success"
        ? typeof value.service_worker_version !== "string" ||
          !/^biblequest-v\d{1,4}$/.test(value.service_worker_version)
        : hasVersion
      : hasVersion
  ) {
    return null;
  }
  return {
    surface: value.surface,
    stage: value.stage,
    outcome: value.outcome,
    category: value.category,
    ...(hasVersion
      ? { service_worker_version: value.service_worker_version }
      : {}),
  };
}

/** Extracts only message-bearing fields from a Vercel JSONL row. */
function messagesFromLogRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const candidates = [value.message, value.text, value.payload?.text];
  return candidates.filter((item) => typeof item === "string");
}

/** Converts raw JSONL in memory to validated signals without returning raw rows. */
export function signalsFromJsonLines(input) {
  if (typeof input !== "string") return [];
  const signals = [];
  for (const line of input.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const direct = parseClientSignalMessage(line);
    if (direct) {
      signals.push(direct);
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    for (const message of messagesFromLogRow(row)) {
      const signal = parseClientSignalMessage(message);
      if (signal) signals.push(signal);
    }
  }
  return signals;
}

/** Discards a provider result when its row cap could hide later signals. */
export function boundedSignalCollection(input, rowLimit = Number.POSITIVE_INFINITY) {
  if (typeof input !== "string") {
    return { status: "unavailable", row_count: 0, signals: [] };
  }
  const rowCount = input.split(/\r?\n/).filter((line) => line.trim()).length;
  if (Number.isFinite(rowLimit) && rowCount >= rowLimit) {
    return { status: "truncated", row_count: rowCount, signals: [] };
  }
  return {
    status: "complete",
    row_count: rowCount,
    signals: signalsFromJsonLines(input),
  };
}

/** Produces stable key ordering for reviewable aggregate evidence. */
function sortedCounts(counts) {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

/** Aggregates safe signals without retaining any source row or identifier. */
export function aggregateClientSignals(signals, collectionStatus = "complete") {
  const buckets = Object.fromEntries(
    SURFACES.map((surface) => [
      surface,
      {
        success: 0,
        failure: 0,
        by_category: {},
        by_stage: {},
      },
    ]),
  );
  const versions = {};
  for (const signal of signals) {
    const safe = parseClientSignalMessage(
      JSON.stringify({ event: "biblequest_client_signal_v1", ...signal }),
    );
    if (!safe) continue;
    const bucket = buckets[safe.surface];
    bucket[safe.outcome] += 1;
    bucket.by_category[safe.category] =
      (bucket.by_category[safe.category] ?? 0) + 1;
    bucket.by_stage[safe.stage] = (bucket.by_stage[safe.stage] ?? 0) + 1;
    if (safe.service_worker_version) {
      versions[safe.service_worker_version] =
        (versions[safe.service_worker_version] ?? 0) + 1;
    }
  }

  const normalized = {};
  for (const surface of SURFACES) {
    const bucket = buckets[surface];
    const attempts = bucket.success + bucket.failure;
    normalized[surface] = {
      attempts,
      success: bucket.success,
      failure: bucket.failure,
      failure_rate: attempts ? Number((bucket.failure / attempts).toFixed(4)) : 0,
      by_category: sortedCounts(bucket.by_category),
      by_stage: sortedCounts(bucket.by_stage),
    };
  }
  normalized.service_worker.versions = sortedCounts(versions);
  return {
    available: collectionStatus === "complete",
    collection_status: collectionStatus,
    total: SURFACES.reduce(
      (sum, surface) => sum + normalized[surface].attempts,
      0,
    ),
    ...normalized,
  };
}

/** Builds one bounded alert record with a placeholder owner role. */
function alert(severity, code, owner, action) {
  return { severity, code, owner, action };
}

/** Applies the checked-in launch thresholds to one auth or sync surface. */
function rateAlerts(surface, bucket) {
  const result = [];
  const thresholds = observability.thresholds;
  if (
    bucket.attempts >= thresholds.minimumAttempts &&
    bucket.failure >= thresholds.criticalFailureCount &&
    bucket.failure_rate >= thresholds.criticalFailureRate
  ) {
    result.push(
      alert(
        "critical",
        `${surface}_failure_rate_critical`,
        surface === "sync" ? "[SYNC OWNER]" : "[AUTH OWNER]",
        "hold or contain the affected capability and begin rollback evaluation",
      ),
    );
  } else if (
    bucket.attempts >= thresholds.minimumAttempts &&
    bucket.failure >= thresholds.warningFailureCount &&
    bucket.failure_rate >= thresholds.warningFailureRate
  ) {
    result.push(
      alert(
        "warning",
        `${surface}_failure_rate_warning`,
        surface === "sync" ? "[SYNC OWNER]" : "[AUTH OWNER]",
        "investigate the bounded failure categories before the next checkpoint",
      ),
    );
  }
  return result;
}

/** Evaluates browser signal availability, rates, categories, and worker parity. */
export function evaluateClientSignals(aggregate, phase) {
  const alerts = [];
  if (aggregate.collection_status === "truncated") {
    alerts.push(
      alert(
        "critical",
        "browser_signals_truncated",
        "[MONITORING OWNER]",
        "narrow or paginate the sanitized log query and rerun this checkpoint",
      ),
    );
    return alerts;
  }
  if (!aggregate.available) {
    alerts.push(
      alert(
        phase === "preflight" ? "warning" : "critical",
        "browser_signals_unavailable",
        "[MONITORING OWNER]",
        "restore the sanitized log query and rerun this checkpoint",
      ),
    );
    return alerts;
  }

  const missingSurfaces = SURFACES.filter(
    (surface) => aggregate[surface].attempts === 0,
  );
  if (missingSurfaces.length) {
    alerts.push(
      alert(
        "critical",
        "browser_signal_coverage_missing",
        "[MONITORING OWNER]",
        "run the auth, sync, and active-worker synthetic before continuing",
      ),
    );
  }
  alerts.push(...rateAlerts("auth", aggregate.auth));
  alerts.push(...rateAlerts("sync", aggregate.sync));

  for (const category of ["schema", "permission"]) {
    if ((aggregate.sync.by_category[category] ?? 0) > 0) {
      alerts.push(
        alert(
          "critical",
          `sync_${category}_failure`,
          category === "schema" ? "[DATABASE OWNER]" : "[SECURITY OWNER]",
          "stop rollout, preserve aggregate evidence, and verify schema/RLS posture",
        ),
      );
    }
  }

  const observedVersions = Object.keys(aggregate.service_worker.versions);
  if (
    observedVersions.some(
      (version) => version !== observability.serviceWorkerVersion,
    )
  ) {
    alerts.push(
      alert(
        "critical",
        "service_worker_version_mismatch",
        "[PWA OWNER]",
        "hold rollout and test clean plus existing installed clients",
      ),
    );
  }
  return alerts;
}

/** Returns a complete fail-closed fixture for local command verification. */
export function fixtureReadiness() {
  const schemaChecks = ["0010", "0010", "0011", "0011", "0014", "0015"].map(
    (migration, index) => ({ contract: `fixture_${index}`, migration, ok: true }),
  );
  schemaChecks.push({
    contract: DAILY_QUEST_SYNC_CONTRACT,
    migration: "0015",
    ok: true,
  });
  const contentChecks = [
    "quest_templates",
    "daily_verses",
    "milestones",
    "prayer_prompts",
    "reflection_prompts",
    "premium_quest_posture",
  ].map((table) => ({ table, ok: true }));
  return {
    contract: "biblequest_readiness_v1",
    ok: true,
    external_health: {
      ok: true,
      release: {
        release_sha: "a".repeat(40),
        rollback_sha: "b".repeat(40),
        canonical_origin: observability.canonicalOrigin,
        canonical_origin_matches: true,
        auth_posture: "guest-only",
        analytics_posture: "disabled",
        schema_contract: observability.schemaContract,
        content_contract: observability.contentContract,
        service_worker_version: observability.serviceWorkerVersion,
        billing_mode: "coming-soon",
      },
    },
    canonical_metadata: { ok: true },
    schema_parity: { ok: true, checks: schemaChecks },
    content_parity: { ok: true, checks: contentChecks },
    auth_providers: {
      settings_reachable: true,
      email_enabled: true,
      google_enabled: true,
      phone_disabled: true,
    },
    check_count: 18,
    failed_check_count: 0,
  };
}

/** Returns safe fixture signals for the evidence command and CI. */
export function fixtureSignals() {
  return [
    ...Array.from({ length: 5 }, () => ({
      surface: "auth",
      stage: "session",
      outcome: "success",
      category: "ok",
    })),
    ...Array.from({ length: 5 }, () => ({
      surface: "sync",
      stage: "initial",
      outcome: "success",
      category: "ok",
    })),
    {
      surface: "service_worker",
      stage: "registration",
      outcome: "success",
      category: "ok",
      service_worker_version: observability.serviceWorkerVersion,
    },
  ];
}

/** Combines readiness and client aggregates into incident-safe launch evidence. */
export function buildLaunchEvidence(
  readiness,
  aggregate,
  phase,
  source,
  options = {},
) {
  const environment = options.environment === "preview" ? "preview" : "production";
  const liveBillingVerified = options.liveBillingVerified === true;
  const alerts = evaluateClientSignals(aggregate, phase);
  const release = readiness?.external_health?.release ?? null;
  const schemaChecks = readiness?.schema_parity?.checks;
  const dailyQuestSyncReady =
    Array.isArray(schemaChecks) &&
    schemaChecks.some(
      (check) =>
        check?.contract === DAILY_QUEST_SYNC_CONTRACT &&
        check?.migration === "0015" &&
        check?.ok === true,
    );
  const add = (condition, severity, code, owner, action) => {
    if (condition) alerts.push(alert(severity, code, owner, action));
  };
  add(
    readiness?.contract !== "biblequest_readiness_v1" ||
      readiness?.ok !== true ||
      readiness?.failed_check_count !== 0,
    "critical",
    "readiness_contract_failed",
    "[DEPLOY OWNER]",
    "rerun the complete readiness probe and resolve every failed check",
  );
  add(
    readiness?.external_health?.ok !== true,
    "critical",
    "external_health_failed",
    "[DEPLOY OWNER]",
    "hold rollout and investigate the health contract",
  );
  add(
    release?.release_sha == null,
    "critical",
    "deployed_sha_missing",
    "[DEPLOY OWNER]",
    "enable Vercel system variables and redeploy before promotion",
  );
  add(
    release?.rollback_sha == null,
    "critical",
    "rollback_target_missing",
    "[ROLLBACK AUTHORITY]",
    "record an approved rollback-compatible SHA before launch",
  );
  add(
    release?.canonical_origin_matches !== true ||
      readiness?.canonical_metadata?.ok !== true,
    "critical",
    "canonical_origin_mismatch",
    "[DEPLOY OWNER]",
    "hold rollout and reconcile deployment plus metadata origin",
  );
  add(
    release?.auth_posture === "invalid" ||
      readiness?.auth_providers?.settings_reachable !== true ||
      readiness?.auth_providers?.email_enabled !== true ||
      readiness?.auth_providers?.google_enabled !== true ||
      readiness?.auth_providers?.phone_disabled !== true,
    "critical",
    "auth_posture_invalid",
    "[AUTH OWNER]",
    "hold account rollout and verify the provider posture",
  );
  add(
    release?.auth_posture === "guest-only",
    "warning",
    "auth_guest_only",
    "[AUTH OWNER]",
    "confirm the launch explicitly intends guest-only mode",
  );
  add(
    readiness?.schema_parity?.ok !== true || dailyQuestSyncReady !== true,
    "critical",
    "schema_parity_failed",
    "[DATABASE OWNER]",
    "stop account rollout and follow the forward-only reconciliation runbook",
  );
  add(
    readiness?.content_parity?.ok !== true,
    "critical",
    "content_parity_failed",
    "[CONTENT OWNER]",
    "stop content rollout and compare the frozen manifest by natural key",
  );
  add(
    release?.billing_mode === "invalid" || release?.billing_mode === "sandbox",
    "critical",
    "billing_posture_unsafe",
    "[BILLING OWNER]",
    "keep production coming-soon or complete the approved live billing gate",
  );
  add(
    release?.billing_mode === "live" && !liveBillingVerified,
    "critical",
    "live_billing_gate_missing",
    "[BILLING OWNER]",
    "attach the approved live-billing evidence before using the explicit gate",
  );
  add(
    release?.service_worker_version !== observability.serviceWorkerVersion,
    "critical",
    "health_worker_version_mismatch",
    "[PWA OWNER]",
    "hold rollout and reconcile the health and worker contracts",
  );

  const critical = alerts.filter((item) => item.severity === "critical").length;
  const warning = alerts.filter((item) => item.severity === "warning").length;
  return {
    contract: observability.contract,
    phase,
    environment,
    observed_at: new Date().toISOString(),
    source,
    thresholds: observability.thresholds,
    external_health: readiness?.external_health ?? { ok: false, release: null },
    deployed_sha: release?.release_sha ?? null,
    canonical_origin: {
      expected: observability.canonicalOrigin,
      health_matches: release?.canonical_origin_matches === true,
      metadata_matches: readiness?.canonical_metadata?.ok === true,
    },
    auth_posture: {
      deployment: release?.auth_posture ?? "unknown",
      providers: readiness?.auth_providers ?? null,
    },
    schema_content_parity: {
      schema: readiness?.schema_parity ?? { ok: false, checks: [] },
      content: readiness?.content_parity ?? { ok: false, checks: [] },
    },
    browser_signals: aggregate,
    service_worker_version: {
      expected: observability.serviceWorkerVersion,
      deployed: release?.service_worker_version ?? null,
      observed: Object.keys(aggregate.service_worker.versions),
    },
    billing_mode: release?.billing_mode ?? "unknown",
    live_billing_gate_verified: liveBillingVerified,
    rollback_target_sha: release?.rollback_sha ?? null,
    alerts,
    decision: critical ? "HOLD" : warning ? "REVIEW" : "CONTINUE",
  };
}
