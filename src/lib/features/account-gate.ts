import { accountSyncAvailable } from "@/lib/sync/containment";
import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Whether prayers, quests, the arcade, and the journey require an account.
 *
 * The reason to gate these four is that they are the surfaces that accumulate
 * something a reader would hate to lose — written prayers, a quest streak, a
 * cleared arcade map, a reading journey. An account is where that lives across
 * devices, so asking for one before a reader has invested weeks in a phone's
 * localStorage is kinder than asking afterwards.
 *
 * That argument only holds while an account actually stores anything. Account
 * sync is contained right now (see `containment.ts`), which means signing up
 * today gives a reader a login and nothing else — their journey still lives on
 * the device either way. A gate in that state is a wall in front of a door that
 * opens onto the same room, so `accountGateActive` refuses to be on:
 *
 *   gate flag on + sync contained  → off (the gate would ask for nothing)
 *   gate flag on + sync live       → on
 *   gate flag off                  → off
 *
 * Flipping NEXT_PUBLIC_ACCOUNT_GATE_ENABLED alone cannot turn it on. That is
 * deliberate — it makes it impossible to ship the wall before the room.
 */
export function accountGateEnabled(value: string | undefined): boolean {
  return value === "true";
}

export const ACCOUNT_GATE_ENABLED = accountGateEnabled(
  process.env.NEXT_PUBLIC_ACCOUNT_GATE_ENABLED,
);

/**
 * The gate is only ever active when an account would genuinely keep something.
 * Both arguments are injectable so the rule can be tested at every combination
 * rather than only the one this build happens to be in.
 */
export function accountGateActive(
  syncAvailable: boolean,
  gateEnabled = ACCOUNT_GATE_ENABLED,
): boolean {
  return gateEnabled && syncAvailable;
}

/** Resolves the rule against this build's real configuration. */
export function isAccountGateActive(): boolean {
  return accountGateActive(accountSyncAvailable(isSupabaseConfigured()));
}

export const GATED_SURFACES = [
  "prayer",
  "quests",
  "games",
  "journey",
] as const;

export type GatedSurface = (typeof GATED_SURFACES)[number];

interface SurfaceCopy {
  /** What the reader came for, in their words. */
  readonly title: string;
  /** Why an account, said in terms of what it keeps — never in terms of a rule. */
  readonly reason: string;
}

export const GATED_SURFACE_COPY: Record<GatedSurface, SurfaceCopy> = {
  prayer: {
    title: "Prayers and journals",
    reason:
      "What you write here is yours to keep. An account stores it so it is still there on a new phone, and so it is not one cleared browser away from gone.",
  },
  quests: {
    title: "Quests",
    reason:
      "Quests count what you have done over weeks. An account keeps that count, so a new device picks up where you left off rather than starting you over.",
  },
  games: {
    title: "BibleQuest Arcade",
    reason:
      "The arcade remembers every level you have cleared and every question you have answered. An account keeps that map, and keeps anything you buy, on every device you read from.",
  },
  journey: {
    title: "Your journey",
    reason:
      "Your journey is the long record — what you have read, when, and what grew from it. An account is where it lives so it outlasts any one device.",
  },
};

/** Whether a pathname sits behind the gate. Used by tests and the middleware. */
export function surfaceForPath(pathname: string): GatedSurface | null {
  const match = /^\/app\/([^/?#]+)/.exec(pathname);
  const segment = match?.[1];
  return GATED_SURFACES.includes(segment as GatedSurface)
    ? (segment as GatedSurface)
    : null;
}
