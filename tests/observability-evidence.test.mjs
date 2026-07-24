import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  aggregateClientSignals,
  boundedSignalCollection,
  buildLaunchEvidence,
  evaluateClientSignals,
  fixtureReadiness,
  fixtureSignals,
  isDailyQuestSyncContract,
  isAccountSyncContract,
  ACCOUNT_SYNC_CONTRACT,
  signalsFromJsonLines,
} from "../scripts/lib/observability-evidence.mjs";

const PRIVATE_MARKERS = [
  "fixture prayer",
  "fixture reflection",
  "fixture Scripture",
  "Ada Person",
  "ada@example.test",
  "secret-token",
  "session-cookie",
  "record-123",
  "https://example.test/path?secret=value",
];

/** Wraps one safe signal in a hostile Vercel-shaped row. */
function hostileLogRow(signal) {
  return JSON.stringify({
    id: PRIVATE_MARKERS[7],
    requestId: "request-456",
    path: "/api/observability/client?secret=value",
    host: "random-preview.example.test",
    message: JSON.stringify({
      event: "biblequest_client_signal_v1",
      ...signal,
    }),
    prayer: PRIVATE_MARKERS[0],
    email: PRIVATE_MARKERS[4],
    url: PRIVATE_MARKERS[8],
  });
}

describe("sanitized launch evidence", () => {
  it("discards Vercel metadata and forbidden fields before aggregation", () => {
    const input = hostileLogRow({
      surface: "sync",
      stage: "initial",
      outcome: "failure",
      category: "offline",
    });
    const aggregate = aggregateClientSignals(signalsFromJsonLines(input));
    expect(aggregate.sync).toMatchObject({
      attempts: 1,
      success: 0,
      failure: 1,
      by_category: { offline: 1 },
      by_stage: { initial: 1 },
    });
    const serialized = JSON.stringify(aggregate);
    for (const marker of PRIVATE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
    expect(serialized).not.toContain("request-456");
    expect(serialized).not.toContain("?secret=value");
  });

  it("rejects a structured log message with any private extra field", () => {
    const input = JSON.stringify({
      event: "biblequest_client_signal_v1",
      surface: "auth",
      stage: "session",
      outcome: "failure",
      category: "unknown",
      email: PRIVATE_MARKERS[4],
    });
    expect(signalsFromJsonLines(input)).toEqual([]);
  });

  it("requires the exact bounded daily-quest posture response", () => {
    expect(
      isDailyQuestSyncContract({
        contract: "biblequest_daily_quest_sync_v1",
        ok: true,
      }),
    ).toBe(true);
    expect(
      isDailyQuestSyncContract({
        contract: "biblequest_daily_quest_sync_v1",
        ok: true,
        diagnostic: PRIVATE_MARKERS[4],
      }),
    ).toBe(false);
    expect(
      isDailyQuestSyncContract({
        contract: "biblequest_daily_quest_sync_v1",
        ok: false,
      }),
    ).toBe(false);
  });

  it("accepts only the bounded account-generation boundary contract", () => {
    expect(
      isAccountSyncContract({
        contract: "biblequest_account_sync_v4",
        ok: true,
      }),
    ).toBe(true);
    expect(
      isAccountSyncContract({
        contract: "biblequest_account_sync_v4",
        ok: true,
        diagnostic: PRIVATE_MARKERS[4],
      }),
    ).toBe(false);
    expect(
      isAccountSyncContract({
        contract: "biblequest_account_sync_v2",
        ok: true,
      }),
    ).toBe(false);
    expect(
      isAccountSyncContract({
        contract: "biblequest_account_sync_v4",
        ok: false,
      }),
    ).toBe(false);
  });

  it("applies deterministic warning and critical failure thresholds", () => {
    const warningSignals = [
      ...Array.from({ length: 7 }, () => ({
        surface: "sync",
        stage: "push",
        outcome: "success",
        category: "ok",
      })),
      ...Array.from({ length: 3 }, () => ({
        surface: "sync",
        stage: "push",
        outcome: "failure",
        category: "offline",
      })),
    ];
    const warning = evaluateClientSignals(
      aggregateClientSignals(warningSignals),
      "t+5",
    );
    expect(warning).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "sync_failure_rate_warning",
        owner: "[SYNC OWNER]",
      }),
    );

    const criticalSignals = [
      ...Array.from({ length: 15 }, () => ({
        surface: "auth",
        stage: "session",
        outcome: "success",
        category: "ok",
      })),
      ...Array.from({ length: 5 }, () => ({
        surface: "auth",
        stage: "session",
        outcome: "failure",
        category: "provider",
      })),
      {
        surface: "sync",
        stage: "initial",
        outcome: "failure",
        category: "schema",
      },
    ];
    const critical = evaluateClientSignals(
      aggregateClientSignals(criticalSignals),
      "t+15",
    );
    expect(critical).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          code: "auth_failure_rate_critical",
        }),
        expect.objectContaining({
          severity: "critical",
          code: "sync_schema_failure",
        }),
      ]),
    );
  });

  it("requires browser signal routing after promotion but only warns preflight", () => {
    const unavailable = aggregateClientSignals([], "unavailable");
    expect(evaluateClientSignals(unavailable, "preflight")[0].severity).toBe(
      "warning",
    );
    expect(evaluateClientSignals(unavailable, "t+0")[0].severity).toBe(
      "critical",
    );
  });

  it("holds instead of aggregating a provider result at its row cap", () => {
    const row = hostileLogRow({
      surface: "auth",
      stage: "session",
      outcome: "success",
      category: "ok",
    });
    const collection = boundedSignalCollection(
      Array.from({ length: 1_000 }, () => row).join("\n"),
      1_000,
    );
    expect(collection).toMatchObject({
      status: "truncated",
      row_count: 1_000,
      signals: [],
    });
    expect(
      evaluateClientSignals(
        aggregateClientSignals(collection.signals, collection.status),
        "preflight",
      ),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        code: "browser_signals_truncated",
      }),
    );
  });

  it("holds when successful log access has incomplete synthetic coverage", () => {
    const evidence = buildLaunchEvidence(
      fixtureReadiness(),
      aggregateClientSignals([]),
      "preflight",
      "fixture",
    );
    expect(evidence.decision).toBe("HOLD");
    expect(evidence.alerts).toContainEqual(
      expect.objectContaining({ code: "browser_signal_coverage_missing" }),
    );
  });

  it("requires only worker coverage for an exact guest-only health posture", () => {
    const evidence = buildLaunchEvidence(
      fixtureReadiness(),
      aggregateClientSignals(fixtureSignals()),
      "preflight",
      "fixture",
    );
    expect(evidence.decision).toBe("REVIEW");
    expect(evidence.browser_signals).toMatchObject({
      auth: { attempts: 0 },
      sync: { attempts: 0 },
      service_worker: { attempts: 1 },
    });
    expect(evidence.alerts).not.toContainEqual(
      expect.objectContaining({ code: "browser_signal_coverage_missing" }),
    );
  });

  it("holds when guest-only evidence contains any auth or sync activity", () => {
    const evidence = buildLaunchEvidence(
      fixtureReadiness(),
      aggregateClientSignals([
        {
          surface: "auth",
          stage: "session",
          outcome: "success",
          category: "ok",
        },
        ...fixtureSignals(),
      ]),
      "t+0",
      "fixture",
    );
    expect(evidence.decision).toBe("HOLD");
    expect(evidence.alerts).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        code: "guest_only_account_activity_detected",
      }),
    );
  });

  it("requires auth, sync, and worker coverage for configured auth", () => {
    const configured = fixtureReadiness();
    configured.external_health.release.auth_posture = "configured";
    const incomplete = buildLaunchEvidence(
      configured,
      aggregateClientSignals(fixtureSignals()),
      "preflight",
      "fixture",
    );
    expect(incomplete.decision).toBe("HOLD");
    expect(incomplete.alerts).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        code: "browser_signal_coverage_missing",
      }),
    );

    const complete = buildLaunchEvidence(
      configured,
      aggregateClientSignals([
        {
          surface: "auth",
          stage: "session",
          outcome: "success",
          category: "ok",
        },
        {
          surface: "sync",
          stage: "initial",
          outcome: "success",
          category: "ok",
        },
        ...fixtureSignals(),
      ]),
      "preflight",
      "fixture",
    );
    expect(complete.decision).toBe("CONTINUE");
    expect(complete.alerts).toEqual([]);
  });

  it("does not relax coverage for an unrecognized health posture", () => {
    const unknown = fixtureReadiness();
    unknown.external_health.release.auth_posture = "contained";
    const evidence = buildLaunchEvidence(
      unknown,
      aggregateClientSignals(fixtureSignals()),
      "preflight",
      "fixture",
    );
    expect(evidence.decision).toBe("HOLD");
    expect(evidence.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "browser_signal_coverage_missing" }),
        expect.objectContaining({ code: "auth_posture_invalid" }),
      ]),
    );
  });

  it("holds configured launches when every required synthetic fails", () => {
    const configured = fixtureReadiness();
    configured.external_health.release.auth_posture = "configured";
    const evidence = buildLaunchEvidence(
      configured,
      aggregateClientSignals([
        {
          surface: "auth",
          stage: "session",
          outcome: "failure",
          category: "provider",
        },
        {
          surface: "sync",
          stage: "initial",
          outcome: "failure",
          category: "offline",
        },
        {
          surface: "service_worker",
          stage: "registration",
          outcome: "failure",
          category: "worker",
        },
      ]),
      "preflight",
      "fixture",
    );
    expect(evidence.decision).toBe("HOLD");
    expect(evidence.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "browser_signal_coverage_missing" }),
        expect.objectContaining({ code: "service_worker_synthetic_failed" }),
      ]),
    );
  });

  it("holds guest-only launches when the worker synthetic fails", () => {
    const evidence = buildLaunchEvidence(
      fixtureReadiness(),
      aggregateClientSignals([
        {
          surface: "service_worker",
          stage: "registration",
          outcome: "failure",
          category: "worker",
        },
      ]),
      "preflight",
      "fixture",
    );
    expect(evidence.decision).toBe("HOLD");
    expect(evidence.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "browser_signal_coverage_missing" }),
        expect.objectContaining({ code: "service_worker_synthetic_failed" }),
      ]),
    );
  });

  it("holds on readiness summary or provider false-greens", () => {
    const failedSummary = fixtureReadiness();
    failedSummary.ok = false;
    failedSummary.failed_check_count = 1;
    const summaryEvidence = buildLaunchEvidence(
      failedSummary,
      aggregateClientSignals(fixtureSignals()),
      "preflight",
      "fixture",
    );
    expect(summaryEvidence.decision).toBe("HOLD");
    expect(summaryEvidence.alerts).toContainEqual(
      expect.objectContaining({ code: "readiness_contract_failed" }),
    );

    const disabledProvider = fixtureReadiness();
    disabledProvider.auth_providers.google_enabled = false;
    const providerEvidence = buildLaunchEvidence(
      disabledProvider,
      aggregateClientSignals(fixtureSignals()),
      "preflight",
      "fixture",
    );
    expect(providerEvidence.decision).toBe("HOLD");
    expect(providerEvidence.alerts).toContainEqual(
      expect.objectContaining({ code: "auth_posture_invalid" }),
    );

    const missingCasPosture = fixtureReadiness();
    missingCasPosture.schema_parity.checks =
      missingCasPosture.schema_parity.checks.filter(
        (check) => check.contract !== "biblequest_daily_quest_sync_v1",
      );
    const casEvidence = buildLaunchEvidence(
      missingCasPosture,
      aggregateClientSignals(fixtureSignals()),
      "preflight",
      "fixture",
    );
    expect(casEvidence.decision).toBe("HOLD");
    expect(casEvidence.alerts).toContainEqual(
      expect.objectContaining({ code: "schema_parity_failed" }),
    );

    const missingMutableGuard = fixtureReadiness();
    missingMutableGuard.schema_parity.checks =
      missingMutableGuard.schema_parity.checks.filter(
        (check) => check.contract !== ACCOUNT_SYNC_CONTRACT,
      );
    const mutableEvidence = buildLaunchEvidence(
      missingMutableGuard,
      aggregateClientSignals(fixtureSignals()),
      "preflight",
      "fixture",
    );
    expect(mutableEvidence.decision).toBe("HOLD");
    expect(mutableEvidence.alerts).toContainEqual(
      expect.objectContaining({ code: "schema_parity_failed" }),
    );
  });

  it("requires an explicit verified gate for live billing", () => {
    const live = fixtureReadiness();
    live.external_health.release.billing_mode = "live";
    const aggregate = aggregateClientSignals(fixtureSignals());
    const held = buildLaunchEvidence(live, aggregate, "preflight", "fixture");
    expect(held.decision).toBe("HOLD");
    expect(held.alerts).toContainEqual(
      expect.objectContaining({ code: "live_billing_gate_missing" }),
    );

    const verified = buildLaunchEvidence(
      live,
      aggregate,
      "preflight",
      "fixture",
      { liveBillingVerified: true },
    );
    expect(verified.decision).toBe("REVIEW");
    expect(verified.live_billing_gate_verified).toBe(true);
  });

  it("supports an explicit preview fixture without changing the default", () => {
    const script = fileURLToPath(
      new URL("../scripts/collect-launch-evidence.mjs", import.meta.url),
    );
    const preview = JSON.parse(
      execFileSync(
        process.execPath,
        [script, "--phase=preflight", "--fixture", "--environment=preview"],
        { encoding: "utf8" },
      ),
    );
    expect(preview).toMatchObject({
      decision: "REVIEW",
      environment: "preview",
      source: "fixture",
    });
  });

  it("holds when an installed worker reports a different bounded version", () => {
    const aggregate = aggregateClientSignals([
      {
        surface: "service_worker",
        stage: "registration",
        outcome: "success",
        category: "ok",
        service_worker_version: "biblequest-v14",
      },
    ]);
    expect(evaluateClientSignals(aggregate, "t+0")).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        code: "service_worker_version_mismatch",
      }),
    );
  });

  it("builds complete fixture evidence with every required posture", () => {
    expect(fixtureReadiness()).toMatchObject({
      check_count: 21,
      failed_check_count: 0,
      schema_parity: {
        ok: true,
        checks: expect.arrayContaining([
          expect.objectContaining({
            contract: "generation_bound_account_deletion_v2",
            migration: "0022",
            ok: true,
          }),
        ]),
      },
    });
    const aggregate = aggregateClientSignals(fixtureSignals());
    const evidence = buildLaunchEvidence(
      fixtureReadiness(),
      aggregate,
      "preflight",
      "fixture",
    );
    expect(evidence).toMatchObject({
      decision: "REVIEW",
      environment: "production",
      deployed_sha: "a".repeat(40),
      canonical_origin: {
        health_matches: true,
        metadata_matches: true,
      },
      auth_posture: { deployment: "guest-only" },
      schema_content_parity: {
        schema: { ok: true },
        content: { ok: true },
      },
      billing_mode: "coming-soon",
      rollback_target_sha: "b".repeat(40),
    });
    expect(evidence.service_worker_version.observed).toEqual([
      "biblequest-v21",
    ]);
    expect(evidence.alerts).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "auth_guest_only",
      }),
    ]);
  });
});
