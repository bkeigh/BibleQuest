import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GATED_SURFACES,
  GATED_SURFACE_COPY,
  accountGateActive,
  accountGateEnabled,
  surfaceForPath,
} from "@/lib/features/account-gate";
import { accountSyncAvailable } from "@/lib/sync/containment";

const gate = readFileSync("src/components/app-shell/AccountGate.tsx", "utf8");

describe("the account gate", () => {
  it("stays off while an account would keep nothing", () => {
    // The whole justification for the gate is that an account stores what a
    // reader would hate to lose. While sync is contained it stores nothing, so
    // the gate must refuse to be on no matter what the flag says. This is the
    // test that stops a wall shipping in front of a door onto the same room.
    expect(accountGateActive(false, true)).toBe(false);
    expect(accountGateActive(false, false)).toBe(false);
    expect(accountGateActive(true, false)).toBe(false);
    expect(accountGateActive(true, true)).toBe(true);
  });

  it("is off today, because containment is on", () => {
    // Belt and braces: assert the composed rule against the real containment
    // helper rather than only against injected booleans.
    expect(accountGateActive(accountSyncAvailable(true), true)).toBe(false);
  });

  it("opens only for an explicit true", () => {
    expect(accountGateEnabled("true")).toBe(true);
    for (const value of [undefined, "", "false", "1", "yes", "TRUE"]) {
      expect(accountGateEnabled(value)).toBe(false);
    }
  });

  it("never gates reading", () => {
    // A stranger must be able to read Scripture without being asked who they
    // are. If one of these ever starts resolving to a surface, the gate has
    // grown past what it was for.
    for (const path of [
      "/app",
      "/app/bible",
      "/app/bible/john/3",
      "/app/shepherd",
      "/app/settings",
      "/app/account",
      "/verse/john/3/16",
    ]) {
      expect(surfaceForPath(path)).toBeNull();
    }
  });

  it("gates each surface and everything under it", () => {
    for (const surface of GATED_SURFACES) {
      expect(surfaceForPath(`/app/${surface}`)).toBe(surface);
      expect(surfaceForPath(`/app/${surface}/anything/deeper`)).toBe(surface);
      expect(surfaceForPath(`/app/${surface}?from=home`)).toBe(surface);
    }
  });

  it("gates at the layout so a new route cannot slip past", () => {
    // Per-page wraps gate the pages that existed when they were written. Every
    // gated section owns a layout instead, which covers routes added later.
    for (const surface of GATED_SURFACES) {
      const layout = readFileSync(`src/app/app/${surface}/layout.tsx`, "utf8");
      expect(layout).toContain("AccountGate");
      expect(layout).toContain(`surface="${surface}"`);
    }
  });

  it("asks with a reason rather than a rule", () => {
    // "Sign in to continue" is a toll booth. Every surface has to say what the
    // account keeps, in terms of the reader's own work.
    for (const surface of GATED_SURFACES) {
      const { title, reason } = GATED_SURFACE_COPY[surface];
      expect(title.length).toBeGreaterThan(0);
      expect(reason).toMatch(/account/i);
      expect(reason.length).toBeGreaterThan(80);
      expect(reason.toLocaleLowerCase()).not.toContain("sign in to continue");
    }
    expect(gate).toContain("Make an account");
    // And it always offers the reader somewhere to go that is not the gate.
    expect(gate).toContain("Go read instead");
  });

  it("does not flash the invitation at a signed-in reader", () => {
    // Rendering the invitation during the session lookup would tell a
    // signed-in reader they are signed out for a beat on every visit.
    expect(gate).toMatch(/if \(loading\)/);
  });
});
