"use client";

import {
  NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE,
} from "@/lib/sync/native-account-markers.mjs";

const MAX_USER_ID_LENGTH = 128;

export interface AccountLifecycleHandle {
  readonly token: number;
  readonly userId: string;
}

let activeHandle: AccountLifecycleHandle | null = null;
let revision = 0;
const listeners = new Set<() => void>();

/** Content-free refusal used while an account-destructive operation is active. */
export class AccountLifecycleBusyError extends Error {
  readonly code = NATIVE_ACCOUNT_BETA_UNAVAILABLE_CODE;

  constructor() {
    super("Account access is temporarily unavailable.");
    this.name = "AccountLifecycleBusyError";
  }
}

function validUserId(userId: string): boolean {
  return (
    userId.length > 0 &&
    userId.length <= MAX_USER_ID_LENGTH &&
    userId.trim() === userId &&
    !/[\u0000-\u001f\u007f]/.test(userId)
  );
}

function publish() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

/** Acquire the one device-wide account mutation boundary without waiting. */
export function beginAccountLifecycle(
  userId: string,
): AccountLifecycleHandle | null {
  if (!validUserId(userId) || activeHandle) return null;
  activeHandle = { token: revision + 1, userId };
  publish();
  return activeHandle;
}

/** Release only the exact lifecycle that is still active. */
export function finishAccountLifecycle(handle: AccountLifecycleHandle): void {
  if (!accountLifecycleHandleIsCurrent(handle)) return;
  activeHandle = null;
  publish();
}

/** Prove an async continuation still owns the same account lifecycle. */
export function accountLifecycleHandleIsCurrent(
  handle: AccountLifecycleHandle,
): boolean {
  return (
    activeHandle?.token === handle.token &&
    activeHandle.userId === handle.userId
  );
}

export function accountLifecycleIsActive(): boolean {
  return activeHandle !== null;
}

/** Capture an idle boundary that can be checked after an async prerequisite. */
export function requireAccountLifecycleIdle(
  expectedRevision = revision,
): number {
  if (activeHandle || expectedRevision !== revision) {
    throw new AccountLifecycleBusyError();
  }
  return revision;
}

export function subscribeAccountLifecycle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function accountLifecycleSnapshot(): number {
  return revision;
}
