"use client";

import type { Session, User } from "@supabase/supabase-js";

export const SESSION_LOOKUP_DEADLINE_MS = 12_000;

interface GuestSessionState {
  user: User | null;
  loading: boolean;
  configured: boolean;
  recovery: "none";
}

export type WebAuthBootstrapDecision =
  | { action: "accept-active"; session: Session }
  | { action: "signed-out" }
  | { action: "resume-deletion"; session: Session }
  | { action: "purge-deleted"; session: Session }
  | { action: "resume-sign-out"; session: Session }
  | { action: "finish-sign-out"; session: Session }
  | { action: "closed" };

export type MissingWebAuthRecovery = "guest" | "locked" | "closed";

const GUEST_SESSION_STATE: GuestSessionState = Object.freeze({
  user: null,
  loading: false,
  configured: false,
  recovery: "none",
});

/** Keeps a defensive pure helper closed unless local ownership is unambiguous. */
export function decideMissingWebAuthRecovery(owner: {
  status: string;
}): MissingWebAuthRecovery {
  if (owner.status === "unowned") return "guest";
  return owner.status === "owned" ? "locked" : "closed";
}

/** Refuses retained browser-auth state in a guest-only native artifact. */
export function decideWebAuthBootstrap(): WebAuthBootstrapDecision {
  return { action: "closed" };
}

/** Exposes one immutable, signed-out session without constructing an SDK client. */
export function useSession(): GuestSessionState {
  return GUEST_SESSION_STATE;
}
