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
      "biblequest-v15",
    ]);
    expect(evidence.alerts).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "auth_guest_only",
      }),
    ]);
  });
});
