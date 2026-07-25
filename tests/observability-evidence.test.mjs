import { describe, expect, it } from "vitest";
import {
  aggregateClientSignals,
  buildLaunchEvidence,
  evaluateClientSignals,
  fixtureReadiness,
  fixtureSignals,
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
    const unavailable = aggregateClientSignals([], false);
    expect(evaluateClientSignals(unavailable, "preflight")[0].severity).toBe(
      "warning",
    );
    expect(evaluateClientSignals(unavailable, "t+0")[0].severity).toBe(
      "critical",
    );
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
      decision: "CONTINUE",
      deployed_sha: "a".repeat(40),
      canonical_origin: {
        health_matches: true,
        metadata_matches: true,
      },
      auth_posture: { deployment: "configured" },
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
    expect(evidence.alerts).toEqual([]);
  });
});
