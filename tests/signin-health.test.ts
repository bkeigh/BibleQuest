import { describe, expect, it } from "vitest";
import { assessSigninHealth } from "../scripts/lib/signin-health.mjs";

const NOW = new Date("2026-08-18T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

/** A person who signed up and never got in. */
function stuck(hours: number) {
  return { id: `stuck-${hours}`, created_at: hoursAgo(hours) };
}

/** A person who signed in successfully. */
function healthy(signedInHoursAgo: number) {
  return {
    id: `ok-${signedInHoursAgo}`,
    created_at: hoursAgo(signedInHoursAgo + 1),
    last_sign_in_at: hoursAgo(signedInHoursAgo),
  };
}

describe("sign-in health", () => {
  it("would have caught the real failure: someone stuck since yesterday", () => {
    // The whole point. Between 2026-08-14 and 2026-08-18 people signed up and
    // could not get in for days, and nothing noticed.
    const report = assessSigninHealth([healthy(2), stuck(20)], NOW);

    expect(report.ok).toBe(false);
    expect(report.newlyStuck).toBe(1);
    expect(report.problems[0]).toMatch(/never got in/i);
    // It must say they cannot report it themselves — that is why this exists.
    expect(report.problems[0]).toMatch(/cannot report/i);
  });

  it("stays quiet for a known backlog so the alert keeps meaning something", () => {
    // Five accounts have been stuck for weeks. Firing on them every run trains
    // the reader to ignore the alert, which is how the original defects
    // survived. Backlog is counted, never alerted.
    const backlog = [stuck(24 * 31), stuck(24 * 30), stuck(24 * 27), stuck(24 * 13)];
    const report = assessSigninHealth([...backlog, healthy(3)], NOW);

    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
    expect(report.neverSignedIn).toBe(4);
    expect(report.backlogStuck).toBe(4);
    expect(report.newlyStuck).toBe(0);
  });

  it("separates a fresh failure from that same backlog", () => {
    const backlog = [stuck(24 * 31), stuck(24 * 30)];
    const report = assessSigninHealth([...backlog, stuck(6)], NOW);

    expect(report.ok).toBe(false);
    expect(report.newlyStuck).toBe(1);
    expect(report.backlogStuck).toBe(2);
    expect(report.neverSignedIn).toBe(3);
  });

  it("treats the boundary as still fresh, not silently dropped", () => {
    // An account exactly at the window edge must alert. Off-by-one here means
    // a real failure goes unreported at the one moment it is most actionable.
    expect(assessSigninHealth([stuck(48)], NOW, { freshHours: 48 }).newlyStuck).toBe(1);
    expect(assessSigninHealth([stuck(49)], NOW, { freshHours: 48 }).newlyStuck).toBe(0);
  });

  it("counts recent successful sign-ins as liveness", () => {
    const report = assessSigninHealth(
      [healthy(1), healthy(23), healthy(25), stuck(24 * 40)],
      NOW,
    );

    expect(report.signedInLastDay).toBe(2);
    expect(report.totalUsers).toBe(4);
    expect(report.ok).toBe(true);
  });

  it("refuses malformed input instead of reporting a false all-clear", () => {
    // A check that answers "fine" when it cannot actually tell is the exact
    // failure shape this whole effort has been chasing.
    expect(() => assessSigninHealth(null, NOW)).toThrow(TypeError);
    expect(() => assessSigninHealth([], new Date("nonsense"))).toThrow(TypeError);
    expect(() => assessSigninHealth([], NOW, { freshHours: 0 })).toThrow(RangeError);
  });
});
