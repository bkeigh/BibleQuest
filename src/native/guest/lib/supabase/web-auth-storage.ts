"use client";

/** Describes the session shape without importing a provider package. */
interface SessionUser {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
  email?: string;
}

/** Matches the provider session fields consumed by shared TypeScript callers. */
interface Session {
  provider_token?: string | null;
  provider_refresh_token?: string | null;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: "bearer";
  user: SessionUser;
}

/** Matches the exact credential shape used by shared cleanup callers. */
interface ExactNativeAuthSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** Keeps shared cleanup result handling structurally compatible. */
type ExactCredentialClearResult =
  | "cleared"
  | "different-session"
  | "missing"
  | "not-native"
  | "unavailable";

/** Keeps account storage names invalid and absent from the guest artifact. */
export const WEB_AUTH_V2_KEY = "";
export const WEB_AUTH_V2_MIGRATION_KEY = "";
export const WEB_PRIVATE_WRITE_GENERATION_KEY = "";

export type WebAuthMode =
  | "installing"
  | "active"
  | "deleting"
  | "signing-out";

export type WebAuthInstallIntent = "fresh" | "keep";

export interface WebAuthEnvelope {
  version: 2;
  mode: WebAuthMode;
  installIntent?: WebAuthInstallIntent;
  session: Session;
}

export type WebAuthState =
  | { status: "missing" }
  | { status: "unavailable" }
  | {
      status: "stored";
      mode: WebAuthMode;
      installIntent?: WebAuthInstallIntent;
      session: Session;
      sessionId: string;
      credential: ExactNativeAuthSession;
    };

export type WebSessionInstallResult =
  | "installed"
  | "recovery-required"
  | "occupied"
  | "invalid"
  | "unavailable";

export type WebSessionMarkResult =
  | "marked"
  | "missing"
  | "different-session"
  | "different-state"
  | "unavailable";

export type SubjectClearResult =
  | "cleared"
  | "different-user"
  | "missing"
  | "unavailable";

export type LegacyWebAuthMigrationResult =
  | "installed"
  | "recovery-required"
  | "already-complete"
  | "empty"
  | "invalid"
  | "unavailable";

export type InstallingWebSessionResolution =
  | "activated"
  | "choice-required"
  | "unavailable";

export type InstallingWebSessionAuthorization =
  | "automatic"
  | "explicit-keep-local-journey"
  | "explicit-start-fresh";

export type WebSessionInstallSource =
  | "email-otp"
  | "oauth"
  | "legacy-migration";

export type RetainedWebSessionVerification =
  | "active"
  | "pending"
  | "deleted"
  | "revoked"
  | "invalid"
  | "unavailable";

/** Defines the storage adapter shape expected by shared client code. */
interface StrictStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Brands handles so ordinary guest values cannot become account authority. */
declare const WEB_ACCOUNT_OPERATION: unique symbol;
export interface WebAccountOperationHandle {
  readonly [WEB_ACCOUNT_OPERATION]: true;
}

/** Carries only the guest-local write generation used by shared stores. */
export interface WebPrivateWriteGuard {
  readonly generation: string;
}

/** Brands a short-lived guest-local read lease. */
declare const WEB_PRIVATE_READ_LEASE: unique symbol;
export interface WebPrivateReadLease {
  readonly [WEB_PRIVATE_READ_LEASE]: true;
}

/** Brands an explicit guest-local removal request. */
declare const WEB_PRIVATE_REMOVAL_GUARD: unique symbol;
export interface WebPrivateRemovalGuard {
  readonly [WEB_PRIVATE_REMOVAL_GUARD]: true;
}

export type LegacyWebPrivateGuestRecoveryAuthorization =
  | "inspect"
  | "explicit-keep"
  | "explicit-clear";

/** Bounds local reset listeners without ever invoking them for account state. */
const MAX_PRIVATE_MEMORY_RESET_HANDLERS = 16;
const privateMemoryResetHandlers = new Set<() => void>();

/** Keeps guest-local storage work ordered inside this JavaScript realm. */
let localStorageOperations: Promise<void> = Promise.resolve();

/** Uses unforgeable singleton objects for guest-local read and removal checks. */
const GUEST_READ_LEASE = Object.freeze({}) as WebPrivateReadLease;
const GUEST_WRITE_GUARD = Object.freeze({ generation: "" });
const GUEST_REMOVAL_GUARD = Object.freeze({}) as WebPrivateRemovalGuard;

/** Resolves local storage without leaking a browser access exception. */
function localStorageSurface(): Pick<Storage, "getItem"> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Registers one bounded guest-local memory reset callback. */
export function registerWebPrivateMemoryReset(reset: () => void): () => void {
  if (
    !privateMemoryResetHandlers.has(reset) &&
    privateMemoryResetHandlers.size >= MAX_PRIVATE_MEMORY_RESET_HANDLERS
  ) {
    return () => undefined;
  }
  privateMemoryResetHandlers.add(reset);
  return () => privateMemoryResetHandlers.delete(reset);
}

/** Reports every attempted account operation as unavailable. */
export class WebAuthUnavailableError extends Error {
  readonly code = "unavailable";

  constructor() {
    super("This operation is unavailable in the guest build.");
    this.name = "WebAuthUnavailableError";
  }
}

/** Preserves the lock-specific error class without granting a lock. */
export class WebAuthLockUnavailableError extends WebAuthUnavailableError {
  constructor() {
    super();
    this.name = "WebAuthLockUnavailableError";
  }
}

/** Hides provider details because guest OAuth can never start. */
export class WebOAuthCompletionError extends WebAuthUnavailableError {
  readonly providerCode: string | null = null;

  constructor(_cause: unknown) {
    super();
    void _cause;
    this.name = "WebOAuthCompletionError";
  }
}

/** Refuses to create an account-operation handle or run its callback. */
export function withWebAccountOperationLock<T>(
  operation: (handle: WebAccountOperationHandle) => Promise<T>,
  existing?: WebAccountOperationHandle,
  acquireTimeout = -1,
): Promise<T> {
  void operation;
  void existing;
  void acquireTimeout;
  return Promise.reject(new WebAuthUnavailableError());
}

/** Refuses interactive account work without running its callback. */
export function withInteractiveWebAccountOperationLock<T>(
  operation: (handle: WebAccountOperationHandle) => Promise<T>,
  existing?: WebAccountOperationHandle,
): Promise<T> {
  return withWebAccountOperationLock(operation, existing);
}

/** Serializes guest-local storage work without creating account authority. */
export function withWebAuthStorageLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = localStorageOperations.then(operation, operation);
  localStorageOperations = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Refuses every provider SDK lock request. */
export function strictWebAuthSdkLock<T>(
  _name: string,
  acquireTimeout: number,
  operation: () => Promise<T>,
): Promise<T> {
  void _name;
  void acquireTimeout;
  void operation;
  return Promise.reject(new WebAuthUnavailableError());
}

/** Refuses realm attestation because guest builds have no account realm. */
export async function requireCurrentWebAccountRealm(
  handle: WebAccountOperationHandle,
): Promise<void> {
  void handle;
  throw new WebAuthUnavailableError();
}

/** Refuses to inspect a retained session. */
export async function verifyRetainedWebAuthSession(
  session: Session,
): Promise<RetainedWebSessionVerification> {
  void session;
  return "unavailable";
}

/** Refuses to refresh a retained deletion session. */
export async function refreshRetainedDeletingWebSession(
  handle: WebAccountOperationHandle,
  retainedSession: Session,
): Promise<RetainedWebSessionVerification> {
  void handle;
  void retainedSession;
  return "unavailable";
}

/** Installs no cross-tab listener because no guest auth state can change. */
export function subscribeWebAuthStorageChanges(
  listener: () => void,
): () => void {
  void listener;
  return () => undefined;
}

/** Returns an adapter that can neither read nor write credentials. */
export function createStrictWebAuthStorage(): StrictStorage {
  return {
    getItem(_key) {
      void _key;
      return null;
    },
    setItem(_key, _value) {
      void _key;
      void _value;
      throw new WebAuthUnavailableError();
    },
    removeItem(_key) {
      void _key;
      throw new WebAuthUnavailableError();
    },
  };
}

/** Refuses session inspection without reading browser credential storage. */
export function readWebAuthState(
  handle?: WebAccountOperationHandle,
): Promise<WebAuthState> {
  void handle;
  return Promise.resolve({ status: "unavailable" });
}

/** Refuses account-bound legacy absence authority. */
export function webPrivateLegacyAbsenceAuditAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): boolean {
  void handle;
  void expectedUserId;
  return false;
}

/** Refuses to run an account-bound legacy audit. */
export async function withWebPrivateLegacyAbsenceAudit(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  audit: () => Promise<boolean>,
): Promise<boolean> {
  void handle;
  void expectedUserId;
  void audit;
  return false;
}

/** Allows guest-local reads only when a storage surface exists. */
export function webPrivateReadAllowed(
  storage: Pick<Storage, "getItem"> | null = localStorageSurface(),
): boolean {
  return storage !== null;
}

/** Captures the one guest-local read lease without reading account state. */
export function captureWebPrivateReadLease(
  storage: Pick<Storage, "getItem"> | null = localStorageSurface(),
): WebPrivateReadLease | null {
  return webPrivateReadAllowed(storage) ? GUEST_READ_LEASE : null;
}

/** Accepts only the guest-local lease while storage remains available. */
export function webPrivateReadLeaseIsCurrent(
  lease: WebPrivateReadLease,
  storage: Pick<Storage, "getItem"> | null = localStorageSurface(),
): boolean {
  return lease === GUEST_READ_LEASE && webPrivateReadAllowed(storage);
}

/** Refuses account-bound guest provenance authority. */
export function webPrivateNeverOwnedGuestProvenanceAllowed(): boolean {
  return false;
}

/** Refuses to establish an account-bound guest provenance record. */
export async function withNeverOwnedWebPrivateGuestProvenance(
  handle: WebAccountOperationHandle,
  establish: () => Promise<boolean>,
): Promise<boolean> {
  void handle;
  void establish;
  return false;
}

/** Refuses every account-bound legacy recovery choice. */
export function webPrivateLegacyGuestRecoveryAllowed(
  authorization: LegacyWebPrivateGuestRecoveryAuthorization,
): boolean {
  void authorization;
  return false;
}

/** Refuses to run an account-bound legacy recovery callback. */
export async function withLegacyWebPrivateGuestRecovery(
  handle: WebAccountOperationHandle,
  authorization: LegacyWebPrivateGuestRecoveryAuthorization,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  void handle;
  void authorization;
  void operation;
  return false;
}

/** Refuses to adopt an account write generation. */
export async function adoptCurrentWebPrivateWriteGeneration(
  handle: WebAccountOperationHandle,
  expectedUserId: string | null,
): Promise<boolean> {
  void handle;
  void expectedUserId;
  return false;
}

/** Creates only the guest-local write guard used by local stores. */
export function beginWebPrivateWrite(): WebPrivateWriteGuard | null {
  return localStorageSurface() ? GUEST_WRITE_GUARD : null;
}

/** Refuses terminal account cleanup and never runs its callback. */
export async function withTerminalWebPrivateWriteCleanup<T>(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  operation: () => Promise<T>,
): Promise<T> {
  void handle;
  void expectedUserId;
  void operation;
  throw new WebAuthUnavailableError();
}

/** Refuses terminal account removal authority. */
export function terminalWebPrivateWriteRemovalAllowed(): boolean {
  return false;
}

/** Refuses a terminal account purge and never runs its callback. */
export async function confirmTerminalWebPrivateDataPurge(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  proveOrPurge: () => Promise<boolean>,
): Promise<boolean> {
  void handle;
  void expectedUserId;
  void proveOrPurge;
  return false;
}

/** Refuses an active-account reset and never runs its callback. */
export async function withActiveWebPrivateWriteReset(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  void handle;
  void expectedUserId;
  void operation;
  return false;
}

/** Allows explicit guest-local removal without granting account authority. */
export function reviewedWebPrivateWriteRemovalAllowed(): boolean {
  return true;
}

/** Creates only the guest-local removal guard used by Settings clear. */
export function beginReviewedWebPrivateRemoval(): WebPrivateRemovalGuard | null {
  return localStorageSurface() ? GUEST_REMOVAL_GUARD : null;
}

/** Accepts only the guest-local removal singleton. */
export function webPrivateRemovalGuardIsCurrent(
  guard: WebPrivateRemovalGuard,
): boolean {
  return guard === GUEST_REMOVAL_GUARD;
}

/** Refuses account fresh-install reset authority. */
export function webPrivateFreshInstallResetAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): boolean {
  void handle;
  void expectedUserId;
  return false;
}

/** Refuses active-account reset commit authority. */
export function webPrivateActiveResetCommitAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): boolean {
  void handle;
  void expectedUserId;
  return false;
}

/** Refuses owner-bound local reset and never runs its callback. */
export async function withLockedLocalJourneyPrivateReset(
  handle: WebAccountOperationHandle,
  expectedOwnerUserId: string,
  purgeAllNamespaces: () => Promise<boolean>,
): Promise<boolean> {
  void handle;
  void expectedOwnerUserId;
  void purgeAllNamespaces;
  return false;
}

/** Refuses account namespace cutover authority. */
export function webPrivateInstallCutoverAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): boolean {
  void handle;
  void expectedUserId;
  return false;
}

/** Refuses reads tied to an installing account. */
export function webPrivateInstallingReadAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  storage: Pick<Storage, "getItem"> | null = localStorageSurface(),
): boolean {
  void handle;
  void expectedUserId;
  void storage;
  return false;
}

/** Accepts only the singleton issued for guest-local writes. */
export function webPrivateWriteGuardIsCurrent(
  guard: WebPrivateWriteGuard,
): boolean {
  return guard === GUEST_WRITE_GUARD;
}

/** Returns no active credential. */
export async function readActiveWebAuthSession(
  handle?: WebAccountOperationHandle,
): Promise<ExactNativeAuthSession | null> {
  void handle;
  return null;
}

/** Returns no active credential alias. */
export async function readActiveWebAuthCredential(
  handle?: WebAccountOperationHandle,
): Promise<ExactNativeAuthSession | null> {
  void handle;
  return null;
}

/** Returns no provider session. */
export async function readActiveWebSession(
  handle?: WebAccountOperationHandle,
): Promise<Session | null> {
  void handle;
  return null;
}

/** Refuses a request for an expected credential. */
export async function readExpectedWebAuthSession(
  expectedUserId: string,
  allowedModes: readonly WebAuthMode[],
  handle?: WebAccountOperationHandle,
): Promise<ExactNativeAuthSession> {
  void expectedUserId;
  void allowedModes;
  void handle;
  throw new WebAuthUnavailableError();
}

/** Refuses to resume an installing session. */
export async function resumeInstallingWebSession(
  handle: WebAccountOperationHandle,
  authorization: InstallingWebSessionAuthorization = "automatic",
): Promise<InstallingWebSessionResolution> {
  void handle;
  void authorization;
  return "unavailable";
}

/** Refuses to install a verified session. */
export async function installVerifiedWebSession(
  handle: WebAccountOperationHandle,
  candidateSession: Session,
  source: WebSessionInstallSource,
): Promise<WebSessionInstallResult> {
  void handle;
  void candidateSession;
  void source;
  return "unavailable";
}

/** Refuses to mark an account as deleting. */
export function markWebAccountDeleting(
  handle: WebAccountOperationHandle,
  expected: ExactNativeAuthSession,
): Promise<WebSessionMarkResult> {
  void handle;
  void expected;
  return Promise.resolve("unavailable");
}

/** Refuses to mark an account as signing out. */
export function markWebAccountSigningOut(
  handle: WebAccountOperationHandle,
  expected: ExactNativeAuthSession,
): Promise<WebSessionMarkResult> {
  void handle;
  void expected;
  return Promise.resolve("unavailable");
}

/** Refuses to clear a credential because none can be stored here. */
export async function clearExactWebAuthSession(
  handle: WebAccountOperationHandle,
  expected: ExactNativeAuthSession,
): Promise<ExactCredentialClearResult> {
  void handle;
  void expected;
  return "unavailable";
}

/** Refuses to clear a revoked account subject. */
export function clearRevokedWebAuthSubject(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): Promise<SubjectClearResult> {
  void handle;
  void expectedUserId;
  return Promise.resolve("unavailable");
}

/** Refuses to clear an expected account subject. */
export function clearExpectedWebAuthSubject(
  expectedUserId: string,
): Promise<SubjectClearResult> {
  void expectedUserId;
  return Promise.resolve("unavailable");
}

/** Reports genuine emptiness because this adapter never stores credentials. */
export function webAuthStorageIsGenuinelyEmpty(): boolean {
  return true;
}

/** Refuses to migrate a legacy credential. */
export async function migrateLegacyWebSession(
  handle: WebAccountOperationHandle,
): Promise<LegacyWebAuthMigrationResult> {
  void handle;
  return "unavailable";
}

/** Refuses provider construction before its callback can run. */
export function constructWithoutAuthBroadcast<T>(construct: () => T): T {
  void construct;
  throw new WebAuthUnavailableError();
}

/** Refuses OAuth completion before reading a code. */
export async function completeVerifiedWebOAuth(
  code: string,
  handle: WebAccountOperationHandle,
): Promise<void> {
  void code;
  void handle;
  throw new WebAuthUnavailableError();
}
