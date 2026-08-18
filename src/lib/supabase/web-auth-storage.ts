"use client";

import {
  createClient as createSupabaseClient,
  NavigatorLockAcquireTimeoutError,
  type Session,
} from "@supabase/supabase-js";
import {
  combineChunks,
  DEFAULT_COOKIE_OPTIONS,
  isChunkLike,
  parse,
  serialize,
  stringFromBase64URL,
} from "@supabase/ssr";
import { withDeadline } from "@/lib/async/deadline";
import { supabasePublishableKey } from "./config";
import {
  EXPECTED_ACCOUNT_USER_HEADER,
} from "@/lib/sync/native-beta-headers";
import {
  WEB_AUTH_PROTOCOL_HEADER,
  WEB_AUTH_PROTOCOL_VERSION,
} from "./web-auth-protocol";
import { requireWebAuthServiceWorkerAttestation } from "@/lib/platform/web-auth-service-worker";
import { readLocalJourneyOwner } from "@/lib/sync/last-user";
import {
  LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
  LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY,
  LEGACY_LAST_SYNC_USER_STORAGE_KEY,
  LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY,
  WEB_PRIVATE_CUTOVER_JOURNAL_KEY,
  WEB_PRIVATE_NEVER_OWNED_VALUE,
  WEB_V2_GUEST_PROVENANCE_STORAGE_KEY,
  WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
  WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
  WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY,
  readWebPrivateGuestClearState,
  readWebPrivateNamespaceState,
} from "@/lib/storage/web-private-namespace";
import type {
  ExactCredentialClearResult,
  ExactNativeAuthSession,
} from "./native-auth-storage";

export const WEB_AUTH_V2_KEY = "biblequest:web-auth:v2";
export const WEB_AUTH_V2_MIGRATION_KEY =
  "biblequest:web-auth:v2:migration-complete";
export const WEB_PRIVATE_WRITE_GENERATION_KEY =
  "biblequest:web-private-write-generation:v1";
const WEB_AUTH_V2_MIGRATION_COMPLETE = "1";
const ACCOUNT_OPERATION_LOCK = "biblequest:web-account-operation:v2";
const AUTH_STORAGE_LOCK = "biblequest:web-auth-storage:v2";
const AUTH_SDK_LOCK = "biblequest:web-auth-sdk:v2";
const AUTH_CHANGE_CHANNEL = "biblequest:web-auth-change:v2";
const AUTH_CHANGE_EVENT = "biblequest:web-auth-change-v2";
const DELETION_STATUS_CONTRACT =
  "biblequest_account_deletion_status_v1";
const AUTH_VERIFICATION_DEADLINE_MS = 12_000;
const MAX_AUTH_VALUE_LENGTH = 128 * 1024;
const MAX_ACCESS_TOKEN_LENGTH = 16_384;
const MAX_REFRESH_TOKEN_LENGTH = 8_192;
const MAX_USER_ID_LENGTH = 128;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_PKCE_VALUE_LENGTH = 8_192;
const BASE64_PREFIX = "base64-";
const PRIVATE_WRITE_GENERATION = /^[a-f0-9]{32}$/;
const MAX_PRIVATE_MEMORY_RESET_HANDLERS = 16;

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

interface StrictStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

type AuthReadStorageSurface = Pick<Storage, "getItem">;
type LocalStorageSurface = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type LocalQueue = "account" | "sdk" | "storage";
type ParsedSession = {
  credential: ExactNativeAuthSession;
  session: Session;
  sessionId: string;
};
type RawRead = { status: "missing" } | { status: "read"; value: string } | {
  status: "unavailable";
};
type LegacyCookieRead =
  | { status: "missing" }
  | { status: "stored"; session: ParsedSession }
  | { status: "invalid" }
  | { status: "unavailable" };
type PrivateWriteGenerationObservation =
  | { status: "missing" }
  | { status: "observed"; generation: string }
  | { status: "unavailable" };
type PrivateReadAuthority =
  | {
      generation: string;
      kind: "account";
      sessionId: string;
      userId: string;
    }
  | { generation: string; kind: "guest" };

declare const WEB_ACCOUNT_OPERATION: unique symbol;
export interface WebAccountOperationHandle {
  readonly [WEB_ACCOUNT_OPERATION]: true;
}

export interface WebPrivateWriteGuard {
  readonly generation: string;
}

declare const WEB_PRIVATE_READ_LEASE: unique symbol;
export interface WebPrivateReadLease {
  readonly [WEB_PRIVATE_READ_LEASE]: true;
}

declare const WEB_PRIVATE_REMOVAL_GUARD: unique symbol;
export interface WebPrivateRemovalGuard {
  readonly [WEB_PRIVATE_REMOVAL_GUARD]: true;
}

let localAccountOperations: Promise<void> = Promise.resolve();
let localSdkOperations: Promise<void> = Promise.resolve();
let localStorageOperations: Promise<void> = Promise.resolve();
let isolatedVerifierSequence = 0;
let adoptedPrivateWriteGeneration: string | null = null;
let adoptedPrivateReadAuthority: PrivateReadAuthority | null = null;
let privateWriteGenerationInvalidated = false;
let privateWriteGenerationObservation: PrivateWriteGenerationObservation = {
  status: "unavailable",
};
let webAccountRealmAttested = false;
const activeAccountOperations = new WeakSet<object>();
let terminalPrivateWriteCleanup: {
  generation: string;
  handle: WebAccountOperationHandle;
  privateDataPurged: boolean;
  userId: string;
} | null = null;
let activePrivateWriteReset: {
  generation: string;
  handle: WebAccountOperationHandle;
  userId: string;
} | null = null;
let lockedLocalJourneyReset: {
  generation: string;
  handle: WebAccountOperationHandle;
  userId: string;
} | null = null;
let installingPrivateWriteReset: {
  generation: string;
  handle: WebAccountOperationHandle;
  userId: string;
} | null = null;
let neverOwnedGuestProvenance: {
  generation: string;
  handle: WebAccountOperationHandle;
} | null = null;
export type LegacyWebPrivateGuestRecoveryAuthorization =
  | "inspect"
  | "explicit-keep"
  | "explicit-clear";
let legacyGuestRecovery: {
  authorization: LegacyWebPrivateGuestRecoveryAuthorization;
  generation: string | null;
  handle: WebAccountOperationHandle;
} | null = null;
let legacyAbsenceAudit: {
  generation: string;
  handle: WebAccountOperationHandle;
  mode: "active" | "locked-owner" | "signing-out";
  sessionId: string | null;
  userId: string;
} | null = null;
let legacyAbsenceClearProof: {
  generation: string;
  handle: WebAccountOperationHandle;
  mode: "active" | "signing-out";
  sessionId: string;
  userId: string;
} | null = null;
const reviewedRemovalGuards = new WeakMap<
  object,
  { context: object; generation: string }
>();
const privateReadLeases = new WeakMap<
  object,
  {
    authority: PrivateReadAuthority;
    generation: string;
  }
>();
const webPrivateMemoryResetHandlers = new Set<() => void>();

/** Registers one bounded synchronous private-memory revoker without a cycle. */
export function registerWebPrivateMemoryReset(reset: () => void): () => void {
  if (
    !webPrivateMemoryResetHandlers.has(reset) &&
    webPrivateMemoryResetHandlers.size >= MAX_PRIVATE_MEMORY_RESET_HANDLERS
  ) {
    throw new WebAuthUnavailableError();
  }
  webPrivateMemoryResetHandlers.add(reset);
  return () => {
    webPrivateMemoryResetHandlers.delete(reset);
  };
}

/** Blanks any loaded private journey before a durable auth transition publishes. */
function revokeWebPrivateMemory(): void {
  for (const reset of [...webPrivateMemoryResetHandlers]) {
    try {
      reset();
    } catch {
      // One defensive reset cannot prevent the remaining stores from clearing.
    }
  }
}

/** Reports an account-boundary refusal without including credential material. */
export class WebAuthUnavailableError extends Error {
  readonly code = "web_auth_unavailable";

  constructor() {
    super("Browser account access is unavailable.");
    this.name = "WebAuthUnavailableError";
  }
}

/**
 * Reports that a cross-tab lock could not be taken, which is not the same
 * claim as account access being unavailable.
 *
 * A lock that is simply held elsewhere is an ordinary, transient condition —
 * another tab is mid-operation, or a caller passed a deliberately impatient
 * timeout to skip rather than queue. Reporting that as unavailability is the
 * same mistake the service worker made when it read silence as refusal.
 *
 * It extends WebAuthUnavailableError so every existing caller keeps treating
 * it exactly as before; only callers that care about the distinction, namely
 * the auth-js boundary below, need to look for it.
 */
export class WebAuthLockUnavailableError extends WebAuthUnavailableError {
  constructor() {
    super();
    this.name = "WebAuthLockUnavailableError";
  }
}

/** Carries the provider's failure reason out of a browser OAuth completion. */
export class WebOAuthCompletionError extends WebAuthUnavailableError {
  readonly providerCode: string | null;

  constructor(cause: unknown) {
    super();
    this.name = "WebOAuthCompletionError";
    const shape = cause as { code?: unknown } | null;
    this.providerCode =
      shape && typeof shape.code === "string" ? shape.code : null;
  }
}

/** Distinguishes a live DOM from server imports and ordinary Node fixtures. */
function isRealBrowserDocument(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    window.document === document
  );
}

/** Serializes non-browser fixtures without claiming cross-tab protection. */
function serializeLocalOperation<T>(
  queue: LocalQueue,
  operation: () => Promise<T>,
): Promise<T> {
  const previous =
    queue === "account"
      ? localAccountOperations
      : queue === "sdk"
        ? localSdkOperations
        : localStorageOperations;
  const result = previous.then(operation, operation);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  if (queue === "account") localAccountOperations = settled;
  else if (queue === "sdk") localSdkOperations = settled;
  else localStorageOperations = settled;
  return result;
}

/** Acquires one real cross-tab lock and never replays a started callback. */
async function withNamedWebLock<T>(
  name: string,
  queue: LocalQueue,
  operation: () => Promise<T>,
  acquireTimeout = -1,
): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) {
    if (isRealBrowserDocument()) throw new WebAuthUnavailableError();
    return serializeLocalOperation(queue, operation);
  }

  let started = false;
  const controller =
    acquireTimeout >= 0 && typeof AbortController !== "undefined"
      ? new AbortController()
      : null;
  const timer = controller
    ? globalThis.setTimeout(() => controller.abort(), acquireTimeout)
    : null;
  try {
    return await locks.request(
      name,
      {
        mode: "exclusive",
        ...(controller ? { signal: controller.signal } : {}),
      },
      async () => {
        started = true;
        if (timer !== null) globalThis.clearTimeout(timer);
        return operation();
      },
    );
  } catch (error) {
    if (started) throw error;
    // The operation never ran, so nothing about account access is proven —
    // only that this caller did not get the lock in the time it allowed.
    throw new WebAuthLockUnavailableError();
  } finally {
    if (timer !== null) globalThis.clearTimeout(timer);
  }
}

/** Holds one complete account transition ahead of later cooperating tabs. */
export function withWebAccountOperationLock<T>(
  operation: (handle: WebAccountOperationHandle) => Promise<T>,
  existing?: WebAccountOperationHandle,
  acquireTimeout = -1,
): Promise<T> {
  if (existing && activeAccountOperations.has(existing)) {
    return operation(existing);
  }
  return withNamedWebLock(
    ACCOUNT_OPERATION_LOCK,
    "account",
    async () => {
      const handle = {} as WebAccountOperationHandle;
      activeAccountOperations.add(handle);
      try {
        return await operation(handle);
      } finally {
        activeAccountOperations.delete(handle);
      }
    },
    acquireTimeout,
  );
}

/** Serializes one exact primary-storage comparison and mutation. */
export function withWebAuthStorageLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return withNamedWebLock(AUTH_STORAGE_LOCK, "storage", operation);
}

/**
 * Supplies auth-js with a strict cross-tab lock rather than its lockless path.
 *
 * auth-js decides what a failed acquire means by `instanceof
 * LockAcquireTimeoutError`, and rethrows anything else. Its auto-refresh tick
 * relies on that: it acquires with a zero timeout specifically to skip a tick
 * when another tab holds the lock, and swallows the timeout error that comes
 * back. A different error type there is rethrown out of an interval callback
 * nobody awaits, which surfaces as an unhandled rejection on every tick — for
 * every visitor, signed in or not.
 *
 * So this boundary speaks auth-js's vocabulary: a lock we could not take is
 * reported as the timeout it actually was. Genuine unavailability, such as a
 * browser with no Web Locks API at all, still propagates unchanged.
 */
export function strictWebAuthSdkLock<T>(
  _name: string,
  acquireTimeout: number,
  operation: () => Promise<T>,
): Promise<T> {
  return withNamedWebLock(AUTH_SDK_LOCK, "sdk", operation, acquireTimeout).catch(
    (error: unknown) => {
      if (error instanceof WebAuthLockUnavailableError) {
        throw new NavigatorLockAcquireTimeoutError(
          `Acquiring an exclusive Navigator LockManager lock "${AUTH_SDK_LOCK}" timed out.`,
        );
      }
      throw error;
    },
  );
}

/** Proves a caller still owns the current account-operation callback. */
function requireAccountOperation(handle: WebAccountOperationHandle): void {
  if (!activeAccountOperations.has(handle)) throw new WebAuthUnavailableError();
}

/** Attests this v28 realm while the caller owns the cross-tab account lock. */
export async function requireCurrentWebAccountRealm(
  handle: WebAccountOperationHandle,
): Promise<void> {
  requireAccountOperation(handle);
  try {
    await requireWebAuthServiceWorkerAttestation();
    requireAccountOperation(handle);
    webAccountRealmAttested = true;
  } catch {
    webAccountRealmAttested = false;
    throw new WebAuthUnavailableError();
  }
}

/** Resolves localStorage without letting a SecurityError escape with context. */
function localStorageSurface(): LocalStorageSurface | null {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** Reads one raw value while preserving absent versus unavailable. */
function readRaw(storage: AuthReadStorageSurface, key: string): RawRead {
  try {
    const value = storage.getItem(key);
    return value === null
      ? { status: "missing" }
      : { status: "read", value };
  } catch {
    return { status: "unavailable" };
  }
}

/** Compares one bounded storage slot without collapsing denial into absence. */
function rawEquals(
  storage: AuthReadStorageSurface,
  key: string,
  expected: string,
): boolean {
  const raw = readRaw(storage, key);
  return raw.status === "read" && raw.value === expected;
}

/** Writes and reads back exact bytes before reporting a durable commit. */
function writeRaw(
  storage: LocalStorageSurface,
  key: string,
  value: string,
): boolean {
  try {
    storage.setItem(key, value);
    return storage.getItem(key) === value;
  } catch {
    return false;
  }
}

/** Removes and reads back one exact storage key. */
function removeRaw(storage: LocalStorageSurface, key: string): boolean {
  try {
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

/** Creates one opaque generation that carries no account-derived material. */
function newPrivateWriteGeneration(): string | null {
  try {
    if (typeof crypto.randomUUID === "function") {
      const value = crypto.randomUUID().replaceAll("-", "").toLowerCase();
      return PRIVATE_WRITE_GENERATION.test(value) ? value : null;
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const value = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return PRIVATE_WRITE_GENERATION.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Reads one exact content-free write generation. */
function readPrivateWriteGeneration(
  storage: AuthReadStorageSurface,
): string | null {
  const raw = readRaw(storage, WEB_PRIVATE_WRITE_GENERATION_KEY);
  return raw.status === "read" && PRIVATE_WRITE_GENERATION.test(raw.value)
    ? raw.value
    : null;
}

/** Captures the generation present before this realm can hydrate private state. */
function capturePrivateWriteGenerationObservation(): PrivateWriteGenerationObservation {
  if (typeof window === "undefined") return { status: "unavailable" };
  const storage = localStorageSurface();
  if (!storage) return { status: "unavailable" };
  const raw = readRaw(storage, WEB_PRIVATE_WRITE_GENERATION_KEY);
  if (raw.status === "missing") return { status: "missing" };
  return raw.status === "read" && PRIVATE_WRITE_GENERATION.test(raw.value)
    ? { status: "observed", generation: raw.value }
    : { status: "unavailable" };
}

privateWriteGenerationObservation = capturePrivateWriteGenerationObservation();

/** Invalidates every previously adopted realm before an auth transition. */
function rotatePrivateWriteGeneration(
  storage: LocalStorageSurface,
): string | null {
  revokeWebPrivateMemory();
  legacyAbsenceClearProof = null;
  adoptedPrivateWriteGeneration = null;
  adoptedPrivateReadAuthority = null;
  privateWriteGenerationInvalidated = true;
  const generation = newPrivateWriteGeneration();
  if (
    !generation ||
    !writeRaw(storage, WEB_PRIVATE_WRITE_GENERATION_KEY, generation)
  ) {
    return null;
  }
  privateWriteGenerationObservation = { status: "observed", generation };
  return generation;
}

/** Decodes only the JWT claims needed for subject and session lineage. */
function jwtIdentity(
  accessToken: string,
): { sessionId: string; subject: string } | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    const claims = payload as Record<string, unknown>;
    if (
      typeof claims.sub !== "string" ||
      !claims.sub ||
      claims.sub.length > MAX_USER_ID_LENGTH ||
      typeof claims.session_id !== "string" ||
      !claims.session_id ||
      claims.session_id.length > MAX_SESSION_ID_LENGTH
    ) {
      return null;
    }
    return { sessionId: claims.session_id, subject: claims.sub };
  } catch {
    return null;
  }
}

/** Accepts one bounded full SDK session with exact JWT ownership. */
function parsedSession(value: unknown): ParsedSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const session = value as Session;
  let serialized: string;
  try {
    serialized = JSON.stringify(session);
  } catch {
    return null;
  }
  if (!serialized || serialized.length > MAX_AUTH_VALUE_LENGTH) return null;
  const userId = session.user?.id;
  if (
    typeof userId !== "string" ||
    !userId ||
    userId.length > MAX_USER_ID_LENGTH ||
    typeof session.access_token !== "string" ||
    !session.access_token ||
    session.access_token.length > MAX_ACCESS_TOKEN_LENGTH ||
    typeof session.refresh_token !== "string" ||
    !session.refresh_token ||
    session.refresh_token.length > MAX_REFRESH_TOKEN_LENGTH
  ) {
    return null;
  }
  const identity = jwtIdentity(session.access_token);
  if (!identity || identity.subject !== userId) return null;
  return {
    credential: {
      userId,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    },
    session,
    sessionId: identity.sessionId,
  };
}

/** Parses the exact v2 envelope and rejects every extra top-level field. */
function parsedEnvelope(value: string): (WebAuthEnvelope & ParsedSession) | null {
  if (!value || value.length > MAX_AUTH_VALUE_LENGTH) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(record).sort().join(",");
    const hasInstallIntent = keys === "installIntent,mode,session,version";
    if (
      (keys !== "mode,session,version" && !hasInstallIntent) ||
      record.version !== 2 ||
      (record.mode !== "installing" &&
        record.mode !== "active" &&
        record.mode !== "deleting" &&
        record.mode !== "signing-out") ||
      (hasInstallIntent &&
        (record.mode !== "installing" ||
          (record.installIntent !== "fresh" &&
            record.installIntent !== "keep")))
    ) {
      return null;
    }
    const session = parsedSession(record.session);
    return session
      ? {
          version: 2,
          mode: record.mode,
          ...(hasInstallIntent
            ? { installIntent: record.installIntent as WebAuthInstallIntent }
            : {}),
          ...session,
        }
      : null;
  } catch {
    return null;
  }
}

/** Reads the v2 envelope while the caller owns the storage lock. */
function readEnvelope(storage: AuthReadStorageSurface): WebAuthState {
  const raw = readRaw(storage, WEB_AUTH_V2_KEY);
  if (raw.status !== "read") return raw;
  const envelope = parsedEnvelope(raw.value);
  return envelope
    ? {
        status: "stored",
        mode: envelope.mode,
        ...(envelope.installIntent
          ? { installIntent: envelope.installIntent }
          : {}),
        session: envelope.session,
        sessionId: envelope.sessionId,
        credential: envelope.credential,
      }
    : { status: "unavailable" };
}

/** Commits one exact envelope with full readback verification. */
function writeEnvelope(
  storage: LocalStorageSurface,
  mode: WebAuthMode,
  session: Session,
  installIntent?: WebAuthInstallIntent,
): boolean {
  try {
    if (installIntent && mode !== "installing") return false;
    const value = JSON.stringify({
      version: 2,
      mode,
      ...(installIntent ? { installIntent } : {}),
      session,
    });
    if (value.length > MAX_AUTH_VALUE_LENGTH) return false;
    return writeRaw(storage, WEB_AUTH_V2_KEY, value);
  } catch {
    return false;
  }
}

/** Compares credentials without placing any token fragment in an error. */
function exactCredentialMatches(
  left: ExactNativeAuthSession,
  right: ExactNativeAuthSession,
): boolean {
  return (
    left.userId === right.userId &&
    left.accessToken === right.accessToken &&
    left.refreshToken === right.refreshToken
  );
}

/** Accepts only the fixed authenticated deletion-status response. */
function exactPendingStatus(value: unknown): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(",") === "contract,pending" &&
    record.contract === DELETION_STATUS_CONTRACT &&
    typeof record.pending === "boolean"
    ? record.pending
    : null;
}

/** Classifies one retained credential without giving verification durable storage. */
async function verifyParsedSession(
  candidate: ParsedSession,
): Promise<RetainedWebSessionVerification> {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = supabasePublishableKey();
  if (!origin || !publishableKey) return "unavailable";
  isolatedVerifierSequence += 1;
  try {
    const verificationHeaders = {
      [EXPECTED_ACCOUNT_USER_HEADER]: candidate.credential.userId,
      [WEB_AUTH_PROTOCOL_HEADER]: WEB_AUTH_PROTOCOL_VERSION,
    };
    // Two clients, not one. supabase-js replaces `client.auth` with a Proxy
    // whose get trap THROWS whenever the `accessToken` option is set, so a
    // single client cannot both answer auth.getUser and carry the person's
    // bearer onto PostgREST. One client shipped here anyway: reading
    // `.getUser` threw before any request was built, the catch below reported
    // "unavailable", and every web sign-in was silently discarded while the
    // server said 200 (2026-08-18). The identity client holds no session —
    // getUser is handed the token explicitly — and the rpc client keeps the
    // accessToken option because that is the only thing putting the person's
    // bearer on own_account_deletion_status; without it the RPC would run as
    // anon and RLS would answer for the wrong principal.
    const identityVerifier = constructWithoutAuthBroadcast(() =>
      createSupabaseClient(origin, publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `biblequest-web-verify-identity-${isolatedVerifierSequence}`,
        },
        global: { headers: verificationHeaders },
      }),
    );
    const verifier = constructWithoutAuthBroadcast(() =>
      createSupabaseClient(origin, publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `biblequest-web-verify-${isolatedVerifierSequence}`,
        },
        accessToken: async () => candidate.credential.accessToken,
        global: { headers: verificationHeaders },
      }),
    );
    const verified = await withDeadline(
      identityVerifier.auth.getUser(candidate.credential.accessToken),
      AUTH_VERIFICATION_DEADLINE_MS,
      "Browser identity verification",
    );
    if (
      verified.error ||
      verified.data.user?.id !== candidate.credential.userId
    ) {
      const code =
        verified.error && typeof verified.error === "object"
          ? (verified.error as { code?: unknown }).code
          : null;
      if (code === "user_not_found") return "deleted";
      return code === "session_not_found" ? "revoked" : "unavailable";
    }
    const status = await withDeadline(
      verifier.rpc("own_account_deletion_status"),
      AUTH_VERIFICATION_DEADLINE_MS,
      "Browser account status verification",
    );
    if (status.error) return "unavailable";
    const pending = exactPendingStatus(status.data);
    if (pending === null) return "invalid";
    if (pending) return "pending";
    return "active";
  } catch {
    return "unavailable";
  }
}

/** Re-verifies a retained full session for bootstrap and terminal recovery. */
export async function verifyRetainedWebAuthSession(
  session: Session,
): Promise<RetainedWebSessionVerification> {
  const parsed = parsedSession(session);
  return parsed ? verifyParsedSession(parsed) : "invalid";
}

/** Refreshes only the same retained deletion lineage in isolated auth memory. */
export async function refreshRetainedDeletingWebSession(
  handle: WebAccountOperationHandle,
  retainedSession: Session,
): Promise<RetainedWebSessionVerification> {
  requireAccountOperation(handle);
  const retained = parsedSession(retainedSession);
  if (!retained) return "invalid";
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = supabasePublishableKey();
  if (!origin || !publishableKey) return "unavailable";

  try {
    isolatedVerifierSequence += 1;
    const refresher = constructWithoutAuthBroadcast(() =>
      createSupabaseClient(origin, publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: `biblequest-web-delete-resume-${isolatedVerifierSequence}`,
        },
        global: {
          headers: {
            [EXPECTED_ACCOUNT_USER_HEADER]: retained.credential.userId,
            [WEB_AUTH_PROTOCOL_HEADER]: WEB_AUTH_PROTOCOL_VERSION,
          },
        },
      }),
    );
    const refreshed = await withDeadline(
      refresher.auth.setSession({
        access_token: retained.credential.accessToken,
        refresh_token: retained.credential.refreshToken,
      }),
      AUTH_VERIFICATION_DEADLINE_MS,
      "Browser deletion-session recovery",
    );
    if (refreshed.error || !refreshed.data.session) return "unavailable";
    const candidate = parsedSession(refreshed.data.session);
    if (
      !candidate ||
      candidate.credential.userId !== retained.credential.userId ||
      candidate.sessionId !== retained.sessionId
    ) {
      return "invalid";
    }
    const verification = await verifyParsedSession(candidate);
    if (verification !== "active" && verification !== "pending") {
      return verification;
    }
    const committed = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return false;
      const current = readEnvelope(storage);
      return Boolean(
        current.status === "stored" &&
          current.mode === "deleting" &&
          current.sessionId === retained.sessionId &&
          exactCredentialMatches(current.credential, retained.credential) &&
          writeEnvelope(storage, "deleting", candidate.session),
      );
    });
    if (!committed) return "unavailable";
    publishAuthStorageChange();
    return verification;
  } catch {
    return "unavailable";
  }
}

/** Accepts only a live subject whose durable deletion latch is clear. */
async function verifiedActiveCandidate(
  candidate: ParsedSession,
): Promise<boolean> {
  return (await verifyParsedSession(candidate)) === "active";
}

/** Identifies only PKCE keys owned by the v2 auth namespace. */
function isPkceKey(key: string): boolean {
  return (
    key.length <= 512 &&
    (key === `${WEB_AUTH_V2_KEY}-code-verifier` ||
      key === `${WEB_AUTH_V2_KEY}-flows-code-verifier` ||
      (key.startsWith(`${WEB_AUTH_V2_KEY}-flow-`) &&
        key.endsWith("-code-verifier")))
  );
}

/** Removes the bounded PKCE index and every slot it names. */
function removePkceState(storage: LocalStorageSurface): boolean {
  let complete = true;
  const indexKey = `${WEB_AUTH_V2_KEY}-flows-code-verifier`;
  const index = readRaw(storage, indexKey);
  if (index.status === "read" && index.value.length <= MAX_PKCE_VALUE_LENGTH) {
    try {
      const parsed: unknown = JSON.parse(index.value);
      if (Array.isArray(parsed)) {
        for (const flowId of parsed) {
          if (
            typeof flowId === "string" &&
            /^[A-Za-z0-9_-]{1,128}$/.test(flowId)
          ) {
            complete =
              removeRaw(
                storage,
                `${WEB_AUTH_V2_KEY}-flow-${flowId}-code-verifier`,
              ) && complete;
          }
        }
      }
    } catch {
      complete = false;
    }
  } else if (index.status === "unavailable") {
    complete = false;
  }
  complete = removeRaw(storage, indexKey) && complete;
  complete =
    removeRaw(storage, `${WEB_AUTH_V2_KEY}-code-verifier`) && complete;
  return complete;
}

/** Emits only a content-free change signal and catches every browser failure. */
function publishAuthStorageChange(): void {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function" &&
      typeof Event !== "undefined"
    ) {
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
    }
  } catch {
    // The durable envelope remains authoritative when local events fail.
  }
  if (typeof BroadcastChannel === "undefined") return;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(AUTH_CHANGE_CHANNEL);
    channel.postMessage({ type: "changed", version: 2 });
  } catch {
    // Hooks reconcile again on focus, navigation, and SDK auth events.
  } finally {
    try {
      channel?.close();
    } catch {
      // Closing a notification channel has no auth authority.
    }
  }
}

/** Subscribes to content-free exact-envelope changes across open tabs. */
export function subscribeWebAuthStorageChanges(
  listener: () => void,
): () => void {
  const safeListener = () => {
    try {
      listener();
    } catch {
      // A subscriber cannot affect the stored account boundary.
    }
  };
  let localInstalled = false;
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener(AUTH_CHANGE_EVENT, safeListener);
      localInstalled = true;
    }
  } catch {
    localInstalled = false;
  }

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(AUTH_CHANGE_CHANNEL);
      channel.onmessage = safeListener;
    }
  } catch {
    channel = null;
  }
  return () => {
    if (localInstalled) {
      try {
        window.removeEventListener(AUTH_CHANGE_EVENT, safeListener);
      } catch {
        // Unsubscription is best effort after the hook is already inactive.
      }
    }
    try {
      channel?.close();
    } catch {
      // The durable envelope remains authoritative.
    }
  };
}

/** Builds the strict SDK adapter for the v2 primary and PKCE namespace. */
export function createStrictWebAuthStorage(): StrictStorage {
  return {
    async getItem(key) {
      try {
        return await withWebAuthStorageLock(async () => {
          const storage = localStorageSurface();
          if (!storage) return null;
          if (!webAccountRealmAttested) return null;
          if (key === WEB_AUTH_V2_KEY) {
            const state = readEnvelope(storage);
            if (state.status !== "stored" || state.mode !== "active") {
              return null;
            }
            return JSON.stringify(state.session);
          }
          if (!isPkceKey(key)) return null;
          const raw = readRaw(storage, key);
          return raw.status === "read" &&
            raw.value.length <= MAX_PKCE_VALUE_LENGTH
            ? raw.value
            : null;
        });
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      let changed = false;
      await withWebAuthStorageLock(async () => {
        const storage = localStorageSurface();
        if (!storage || !webAccountRealmAttested) {
          throw new WebAuthUnavailableError();
        }
        if (key !== WEB_AUTH_V2_KEY) {
          if (!isPkceKey(key) || value.length > MAX_PKCE_VALUE_LENGTH) {
            throw new WebAuthUnavailableError();
          }
          if (!writeRaw(storage, key, value)) {
            throw new WebAuthUnavailableError();
          }
          return;
        }

        let candidateValue: unknown;
        try {
          candidateValue = JSON.parse(value);
        } catch {
          throw new WebAuthUnavailableError();
        }
        const candidate = parsedSession(candidateValue);
        const current = readEnvelope(storage);
        let sessionChanged = false;
        try {
          sessionChanged =
            current.status === "stored" &&
            JSON.stringify(current.session) !== JSON.stringify(candidate?.session);
        } catch {
          throw new WebAuthUnavailableError();
        }
        if (
          !candidate ||
          current.status !== "stored" ||
          current.mode !== "active" ||
          current.credential.userId !== candidate.credential.userId ||
          current.sessionId !== candidate.sessionId ||
          !(await verifiedActiveCandidate(candidate)) ||
          !writeEnvelope(storage, "active", candidate.session)
        ) {
          throw new WebAuthUnavailableError();
        }
        changed = sessionChanged;
      });
      if (changed) publishAuthStorageChange();
    },
    async removeItem(key) {
      if (key === WEB_AUTH_V2_KEY) throw new WebAuthUnavailableError();
      await withWebAuthStorageLock(async () => {
        const storage = localStorageSurface();
        if (
          !storage ||
          !webAccountRealmAttested ||
          !isPkceKey(key) ||
          !removeRaw(storage, key)
        ) {
          throw new WebAuthUnavailableError();
        }
      });
    },
  };
}

/** Reads the complete envelope without ever accepting a terminal mode. */
export function readWebAuthState(
  handle?: WebAccountOperationHandle,
): Promise<WebAuthState> {
  if (handle) requireAccountOperation(handle);
  return withWebAuthStorageLock(async () => {
    const storage = localStorageSurface();
    return storage ? readEnvelope(storage) : { status: "unavailable" };
  });
}

/** Proves the exact legacy marker set for a deliberately never-owned guest. */
function durableNeverOwnedGuestState(
  storage: Pick<Storage, "getItem">,
): boolean {
  return (
    readWebPrivateNamespaceState(storage) === "legacy" &&
    readEnvelope(storage).status === "missing" &&
    readRaw(storage, LEGACY_LAST_SYNC_USER_STORAGE_KEY).status === "missing" &&
    readRaw(storage, LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY).status ===
      "missing" &&
    readRaw(storage, LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY).status ===
      "missing" &&
    readRaw(storage, WEB_V2_LAST_SYNC_USER_STORAGE_KEY).status === "missing" &&
    readRaw(storage, WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY).status ===
      "missing" &&
    readRaw(storage, WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY).status ===
      "missing" &&
    readRaw(storage, WEB_V2_GUEST_PROVENANCE_STORAGE_KEY).status ===
      "missing" &&
    rawEquals(
      storage,
      LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
      WEB_PRIVATE_NEVER_OWNED_VALUE,
    )
  );
}

/** Proves every retained owner marker still belongs to the reviewed account. */
function retainedOwnerMarkersMatch(
  storage: Pick<Storage, "getItem">,
  expectedUserId: string,
): boolean {
  const ownerMarkers = [
    readRaw(storage, LEGACY_LAST_SYNC_USER_STORAGE_KEY),
    readRaw(storage, WEB_V2_LAST_SYNC_USER_STORAGE_KEY),
  ];
  const dependentMarkers = [
    readRaw(storage, LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY),
    readRaw(storage, WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY),
    readRaw(storage, LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY),
    readRaw(storage, WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY),
  ];
  return (
    ownerMarkers.some(
      (marker) => marker.status === "read" && marker.value === expectedUserId,
    ) &&
    [...ownerMarkers, ...dependentMarkers].every(
      (marker) =>
        marker.status === "missing" ||
        (marker.status === "read" && marker.value === expectedUserId),
    )
  );
}

/** Clears both legacy and v2 owner contracts and publishes proven guest state. */
function commitNeverOwnedGuestAfterReviewedPurge(
  storage: LocalStorageSurface,
  expectedUserId: string,
): boolean {
  if (
    readEnvelope(storage).status !== "missing" ||
    readWebPrivateNamespaceState(storage) !== "legacy" ||
    !retainedOwnerMarkersMatch(storage, expectedUserId)
  ) {
    return false;
  }
  const ownerKeys = [
    LEGACY_LAST_SYNC_USER_STORAGE_KEY,
    WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
    LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY,
    WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
    LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY,
    WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY,
  ];
  if (!ownerKeys.every((key) => removeRaw(storage, key))) return false;
  if (
    !removeRaw(storage, WEB_V2_GUEST_PROVENANCE_STORAGE_KEY) ||
    !writeRaw(
      storage,
      LEGACY_GUEST_PROVENANCE_STORAGE_KEY,
      WEB_PRIVATE_NEVER_OWNED_VALUE,
    )
  ) {
    return false;
  }
  return (
    durableNeverOwnedGuestState(storage) &&
    scrubLegacyWebAuthCookies() &&
    durableNeverOwnedGuestState(storage)
  );
}

/** Rechecks exact active v2 authority throughout legacy-residue removal. */
export function webPrivateLegacyAbsenceAuditAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): boolean {
  const audit = legacyAbsenceAudit;
  const storage = localStorageSurface();
  if (
    !audit ||
    !storage ||
    audit.handle !== handle ||
    audit.userId !== expectedUserId ||
    !webAccountRealmAttested ||
    !activeAccountOperations.has(handle) ||
    readPrivateWriteGeneration(storage) !== audit.generation ||
    readWebPrivateNamespaceState(storage) !== "v2" ||
    !rawEquals(storage, WEB_V2_LAST_SYNC_USER_STORAGE_KEY, expectedUserId)
  ) {
    return false;
  }
  const state = readEnvelope(storage);
  const authMatches = audit.mode === "locked-owner"
    ? state.status === "missing" && audit.sessionId === null
    : state.status === "stored" &&
      state.mode === audit.mode &&
      state.credential.userId === expectedUserId &&
      state.sessionId === audit.sessionId;
  return (
    authMatches &&
    readRaw(storage, WEB_V2_GUEST_PROVENANCE_STORAGE_KEY).status === "missing"
  );
}

/** Audits ed28-readable residue before this realm adopts active v2 reads. */
export async function withWebPrivateLegacyAbsenceAudit(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  audit: () => Promise<boolean>,
): Promise<boolean> {
  requireAccountOperation(handle);
  const existingAuthority = adoptedPrivateReadAuthority;
  const existingAuthorityMatches =
    existingAuthority?.kind === "account" &&
    existingAuthority.userId === expectedUserId &&
    webPrivateReadAllowed();
  if (legacyAbsenceAudit || (existingAuthority && !existingAuthorityMatches)) {
    throw new WebAuthUnavailableError();
  }
  const authority = await withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const storage = localStorageSurface();
    if (
      !storage ||
      !webAccountRealmAttested ||
      readWebPrivateNamespaceState(storage) !== "v2" ||
      !rawEquals(storage, WEB_V2_LAST_SYNC_USER_STORAGE_KEY, expectedUserId) ||
      readRaw(storage, WEB_V2_GUEST_PROVENANCE_STORAGE_KEY).status !==
        "missing"
    ) {
      return null;
    }
    const state = readEnvelope(storage);
    const generation = readPrivateWriteGeneration(storage);
    if (!generation) return null;
    if (state.status === "missing") {
      return {
        generation,
        mode: "locked-owner" as const,
        sessionId: null,
      };
    }
    return state.status === "stored" &&
      (state.mode === "active" || state.mode === "signing-out") &&
      state.credential.userId === expectedUserId
      ? { generation, mode: state.mode, sessionId: state.sessionId }
      : null;
  });
  if (!authority) throw new WebAuthUnavailableError();
  legacyAbsenceAudit = {
    ...authority,
    handle,
    userId: expectedUserId,
  };
  legacyAbsenceClearProof = null;
  try {
    if (!(await audit())) return false;
    return await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const complete =
        webPrivateLegacyAbsenceAuditAllowed(handle, expectedUserId) &&
        scrubLegacyWebAuthCookies() &&
        webPrivateLegacyAbsenceAuditAllowed(handle, expectedUserId);
      if (
        complete &&
        authority.mode !== "locked-owner" &&
        authority.sessionId
      ) {
        legacyAbsenceClearProof = {
          ...authority,
          handle,
          userId: expectedUserId,
        };
      }
      return complete;
    });
  } finally {
    if (legacyAbsenceAudit?.mode === "signing-out") {
      webAccountRealmAttested = false;
    }
    if (legacyAbsenceAudit?.handle === handle) legacyAbsenceAudit = null;
  }
}

/** Revalidates one opaque rollback-absence proof before credential removal. */
function legacyAbsenceClearIsConfirmed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  expectedMode: "active" | "signing-out",
): boolean {
  const proof = legacyAbsenceClearProof;
  const storage = localStorageSurface();
  if (
    !proof ||
    !storage ||
    proof.handle !== handle ||
    proof.userId !== expectedUserId ||
    proof.mode !== expectedMode ||
    !activeAccountOperations.has(handle) ||
    readPrivateWriteGeneration(storage) !== proof.generation ||
    !legacyWebAuthCookiesAreAbsent()
  ) {
    return false;
  }
  const state = readEnvelope(storage);
  return (
    state.status === "stored" &&
    state.mode === expectedMode &&
    state.credential.userId === expectedUserId &&
    state.sessionId === proof.sessionId
  );
}

/** Proves no legacy owner metadata can silently authorize ambiguous bytes. */
function legacyGuestOwnerMarkersAreAbsent(
  storage: Pick<Storage, "getItem">,
): boolean {
  return (
    readRaw(storage, LEGACY_LAST_SYNC_USER_STORAGE_KEY).status === "missing" &&
    readRaw(storage, LEGACY_INITIAL_SYNC_PENDING_STORAGE_KEY).status ===
      "missing" &&
    readRaw(storage, LEGACY_LOCAL_CLAIM_PENDING_STORAGE_KEY).status ===
      "missing"
  );
}

/** Grants synchronous private reads only to this realm's exact adopted state. */
export function webPrivateReadAllowed(
  storage: Pick<Storage, "getItem"> | null = localStorageSurface(),
): boolean {
  const authority = adoptedPrivateReadAuthority;
  if (!storage || !authority) return false;
  const generation = readPrivateWriteGeneration(storage);
  if (
    !generation ||
    generation !== authority.generation ||
    adoptedPrivateWriteGeneration !== generation
  ) {
    return false;
  }
  if (authority.kind === "guest") {
    return durableNeverOwnedGuestState(storage);
  }
  if (!webAccountRealmAttested) return false;
  const state = readEnvelope(storage);
  const owner = readRaw(storage, WEB_V2_LAST_SYNC_USER_STORAGE_KEY);
  return (
    readWebPrivateNamespaceState(storage) === "v2" &&
    state.status === "stored" &&
    state.mode === "active" &&
    state.credential.userId === authority.userId &&
    state.sessionId === authority.sessionId &&
    owner.status === "read" &&
    owner.value === authority.userId &&
    readRaw(storage, WEB_V2_GUEST_PROVENANCE_STORAGE_KEY).status === "missing"
  );
}

/** Captures the exact adopted private-read authority before async queueing. */
export function captureWebPrivateReadLease(
  storage: Pick<Storage, "getItem"> | null = localStorageSurface(),
): WebPrivateReadLease | null {
  const authority = adoptedPrivateReadAuthority;
  if (!storage || !authority || !webPrivateReadAllowed(storage)) return null;
  const lease = {} as WebPrivateReadLease;
  privateReadLeases.set(lease, {
    authority,
    generation: authority.generation,
  });
  return lease;
}

/** Rejects a delayed read if any account, lineage, mode, or generation changed. */
export function webPrivateReadLeaseIsCurrent(
  lease: WebPrivateReadLease,
  storage: Pick<Storage, "getItem"> | null = localStorageSurface(),
): boolean {
  const captured = privateReadLeases.get(lease);
  return Boolean(
    storage &&
      captured &&
      captured.authority === adoptedPrivateReadAuthority &&
      captured.generation === adoptedPrivateWriteGeneration &&
      webPrivateReadAllowed(storage),
  );
}

/** Rechecks the narrow fresh-guest provenance authority during async storage work. */
export function webPrivateNeverOwnedGuestProvenanceAllowed(): boolean {
  const authority = neverOwnedGuestProvenance;
  const storage = localStorageSurface();
  return Boolean(
    authority &&
      storage &&
      webAccountRealmAttested &&
      activeAccountOperations.has(authority.handle) &&
      readPrivateWriteGeneration(storage) === authority.generation &&
      readWebPrivateNamespaceState(storage) === "legacy" &&
      readEnvelope(storage).status === "missing" &&
      !terminalPrivateWriteCleanup &&
      !activePrivateWriteReset &&
      !lockedLocalJourneyReset &&
      !installingPrivateWriteReset,
  );
}

/** Establishes and adopts a durable never-owned guest under one account lock. */
export async function withNeverOwnedWebPrivateGuestProvenance(
  handle: WebAccountOperationHandle,
  establish: () => Promise<boolean>,
): Promise<boolean> {
  requireAccountOperation(handle);
  if (neverOwnedGuestProvenance) throw new WebAuthUnavailableError();
  await requireCurrentWebAccountRealm(handle);
  const generation = await withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const storage = localStorageSurface();
    if (
      !storage ||
      readEnvelope(storage).status !== "missing" ||
      readWebPrivateNamespaceState(storage) !== "legacy" ||
      terminalPrivateWriteCleanup ||
      activePrivateWriteReset ||
      lockedLocalJourneyReset ||
      installingPrivateWriteReset
    ) {
      return null;
    }
    return rotatePrivateWriteGeneration(storage);
  });
  if (!generation) throw new WebAuthUnavailableError();
  publishAuthStorageChange();
  neverOwnedGuestProvenance = { generation, handle };
  let complete = false;
  try {
    if (!(await establish())) return false;
    complete = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      return Boolean(
        storage &&
          readPrivateWriteGeneration(storage) === generation &&
          durableNeverOwnedGuestState(storage) &&
          scrubLegacyWebAuthCookies() &&
          durableNeverOwnedGuestState(storage),
      );
    });
    if (!complete) return false;
    adoptedPrivateWriteGeneration = generation;
    adoptedPrivateReadAuthority = { generation, kind: "guest" };
    privateWriteGenerationInvalidated = false;
    const hydrated = await coordinateCurrentWebPrivateJourney();
    if (!hydrated || !webPrivateReadAllowed()) {
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
      complete = false;
      return false;
    }
    return true;
  } finally {
    if (neverOwnedGuestProvenance?.handle === handle) {
      neverOwnedGuestProvenance = null;
    }
    if (!complete) {
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
    }
  }
}

/** Rechecks one explicit missing-auth guest recovery throughout bounded work. */
export function webPrivateLegacyGuestRecoveryAllowed(
  authorization: LegacyWebPrivateGuestRecoveryAuthorization,
): boolean {
  const recovery = legacyGuestRecovery;
  const storage = localStorageSurface();
  if (
    !recovery ||
    !storage ||
    recovery.authorization !== authorization ||
    !webAccountRealmAttested ||
    !activeAccountOperations.has(recovery.handle) ||
    readEnvelope(storage).status !== "missing" ||
    !legacyGuestOwnerMarkersAreAbsent(storage)
  ) {
    return false;
  }
  if (
    authorization !== "inspect" &&
    (!recovery.generation ||
      readPrivateWriteGeneration(storage) !== recovery.generation)
  ) {
    return false;
  }
  const provenance = readRaw(storage, LEGACY_GUEST_PROVENANCE_STORAGE_KEY);
  if (
    provenance.status === "unavailable" ||
    (provenance.status === "read" &&
      provenance.value !== WEB_PRIVATE_NEVER_OWNED_VALUE)
  ) {
    return false;
  }
  if (authorization === "explicit-clear") {
    const clearState = readWebPrivateGuestClearState(storage);
    return (
      clearState === "clearing" ||
      (clearState === "none" &&
        readWebPrivateNamespaceState(storage) === "legacy")
    );
  }
  return (
    readWebPrivateGuestClearState(storage) === "none" &&
    readWebPrivateNamespaceState(storage) === "legacy" &&
    readRaw(storage, WEB_PRIVATE_CUTOVER_JOURNAL_KEY).status === "missing"
  );
}

/** Runs one content-free ambiguous guest decision and adopts only exact proof. */
export async function withLegacyWebPrivateGuestRecovery(
  handle: WebAccountOperationHandle,
  authorization: LegacyWebPrivateGuestRecoveryAuthorization,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  requireAccountOperation(handle);
  if (legacyGuestRecovery) throw new WebAuthUnavailableError();
  await requireCurrentWebAccountRealm(handle);
  const generation = await withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const storage = localStorageSurface();
    if (!storage) return undefined;
    const clearState = readWebPrivateGuestClearState(storage);
    const recoveryStateAllowed = authorization === "explicit-clear"
      ? clearState === "clearing" ||
        (clearState === "none" &&
          readWebPrivateNamespaceState(storage) === "legacy")
      : clearState === "none" &&
        readWebPrivateNamespaceState(storage) === "legacy";
    if (
      readEnvelope(storage).status !== "missing" ||
      !recoveryStateAllowed ||
      !legacyGuestOwnerMarkersAreAbsent(storage) ||
      readRaw(storage, LEGACY_GUEST_PROVENANCE_STORAGE_KEY).status !==
        "missing"
    ) {
      return undefined;
    }
    return authorization === "inspect"
      ? null
      : rotatePrivateWriteGeneration(storage);
  });
  if (generation === undefined || (authorization !== "inspect" && !generation)) {
    throw new WebAuthUnavailableError();
  }
  if (generation) publishAuthStorageChange();
  legacyGuestRecovery = { authorization, generation, handle };
  let complete = false;
  try {
    if (!(await operation())) return false;
    if (authorization === "inspect") return true;
    complete = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      return Boolean(
        storage &&
          generation &&
          readPrivateWriteGeneration(storage) === generation &&
          durableNeverOwnedGuestState(storage) &&
          scrubLegacyWebAuthCookies() &&
          durableNeverOwnedGuestState(storage),
      );
    });
    if (!complete || !generation) return false;
    adoptedPrivateWriteGeneration = generation;
    adoptedPrivateReadAuthority = { generation, kind: "guest" };
    privateWriteGenerationInvalidated = false;
    if (
      !(await coordinateCurrentWebPrivateJourney()) ||
      !webPrivateReadAllowed()
    ) {
      revokeWebPrivateMemory();
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
      complete = false;
      return false;
    }
    return true;
  } finally {
    if (legacyGuestRecovery?.handle === handle) legacyGuestRecovery = null;
    if (authorization !== "inspect" && !complete) {
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
    }
  }
}

/** Coordinates the current adopted guest/account snapshot before UI readiness. */
async function coordinateCurrentWebPrivateJourney(): Promise<boolean> {
  try {
    const { coordinateQuestOSWebPrivateHydration } = await import(
      "@/lib/questos/store"
    );
    return coordinateQuestOSWebPrivateHydration();
  } catch {
    return false;
  }
}

/** Adopts the current generation only for the locked missing or active state. */
export async function adoptCurrentWebPrivateWriteGeneration(
  handle: WebAccountOperationHandle,
  expectedUserId: string | null,
): Promise<boolean> {
  requireAccountOperation(handle);
  if (expectedUserId && !webAccountRealmAttested) return false;
  if (privateWriteGenerationInvalidated) return false;
  const currentAuthority = adoptedPrivateReadAuthority;
  if (
    webPrivateReadAllowed() &&
    (expectedUserId
      ? currentAuthority?.kind === "account" &&
        currentAuthority.userId === expectedUserId
      : currentAuthority?.kind === "guest")
  ) {
    if (!expectedUserId) {
      return withWebAuthStorageLock(async () => {
        const storage = localStorageSurface();
        return Boolean(
          storage &&
            durableNeverOwnedGuestState(storage) &&
            scrubLegacyWebAuthCookies() &&
            durableNeverOwnedGuestState(storage),
        );
      }).catch(() => false);
    }
    const { removeAndProveLegacyWebPrivateResidue } = await import(
      "@/lib/storage/web-private-cutover"
    );
    return withWebPrivateLegacyAbsenceAudit(
      handle,
      expectedUserId,
      () => removeAndProveLegacyWebPrivateResidue(handle, expectedUserId),
    ).catch(() => false);
  }
  try {
    const adopted = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return null;
      const state = readEnvelope(storage);
      const stateMatches = expectedUserId
        ? webAccountRealmAttested &&
          readWebPrivateNamespaceState(storage) === "v2" &&
          state.status === "stored" &&
          state.mode === "active" &&
          state.credential.userId === expectedUserId &&
          rawEquals(
            storage,
            WEB_V2_LAST_SYNC_USER_STORAGE_KEY,
            expectedUserId,
          ) &&
          readRaw(storage, WEB_V2_GUEST_PROVENANCE_STORAGE_KEY).status ===
            "missing"
        : durableNeverOwnedGuestState(storage);
      if (!stateMatches) return null;
      const existing = readRaw(storage, WEB_PRIVATE_WRITE_GENERATION_KEY);
      if (existing.status === "unavailable") return null;
      if (existing.status === "read") {
        const generation = PRIVATE_WRITE_GENERATION.test(existing.value) &&
          privateWriteGenerationObservation.status === "observed" &&
          privateWriteGenerationObservation.generation === existing.value
          ? existing.value
          : null;
        return generation && state.status === "stored"
          ? { generation, sessionId: state.sessionId }
          : generation
            ? { generation, sessionId: null }
            : null;
      }
      if (privateWriteGenerationObservation.status !== "missing") return null;
      const created = newPrivateWriteGeneration();
      if (
        !created ||
        !writeRaw(storage, WEB_PRIVATE_WRITE_GENERATION_KEY, created)
      ) {
        return null;
      }
      privateWriteGenerationObservation = {
        status: "observed",
        generation: created,
      };
      return state.status === "stored"
        ? { generation: created, sessionId: state.sessionId }
        : { generation: created, sessionId: null };
    });
    if (!adopted) return false;
    const { generation, sessionId } = adopted;
    if (
      adoptedPrivateWriteGeneration &&
      adoptedPrivateWriteGeneration !== generation
    ) {
      return false;
    }
    if (expectedUserId && sessionId) {
      const { removeAndProveLegacyWebPrivateResidue } = await import(
        "@/lib/storage/web-private-cutover"
      );
      if (
        !(await withWebPrivateLegacyAbsenceAudit(
          handle,
          expectedUserId,
          () =>
            removeAndProveLegacyWebPrivateResidue(
              handle,
              expectedUserId,
            ),
        ))
      ) {
        return false;
      }
    }
    if (
      !expectedUserId &&
      !(await withWebAuthStorageLock(async () => {
        const storage = localStorageSurface();
        return Boolean(
          storage &&
            readPrivateWriteGeneration(storage) === generation &&
            durableNeverOwnedGuestState(storage) &&
            scrubLegacyWebAuthCookies() &&
            durableNeverOwnedGuestState(storage),
        );
      }))
    ) {
      return false;
    }
    adoptedPrivateWriteGeneration = generation;
    adoptedPrivateReadAuthority = expectedUserId && sessionId
      ? {
          generation,
          kind: "account",
          sessionId,
          userId: expectedUserId,
        }
      : { generation, kind: "guest" };
    privateWriteGenerationInvalidated = false;
    if (
      !(await coordinateCurrentWebPrivateJourney()) ||
      !webPrivateReadAllowed()
    ) {
      revokeWebPrivateMemory();
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
      privateWriteGenerationInvalidated = true;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Begins one synchronous private write only in the adopted safe auth state. */
export function beginWebPrivateWrite(): WebPrivateWriteGuard | null {
  const generation = adoptedPrivateWriteGeneration;
  const storage = localStorageSurface();
  if (!generation || !storage) return null;
  return webPrivateReadAllowed(storage) ? { generation } : null;
}

/** Runs reviewed deletion removals without granting terminal write access. */
export async function withTerminalWebPrivateWriteCleanup<T>(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  operation: () => Promise<T>,
): Promise<T> {
  requireAccountOperation(handle);
  if (terminalPrivateWriteCleanup) throw new WebAuthUnavailableError();
  const generation = await withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const storage = localStorageSurface();
    if (!storage) return null;
    const state = readEnvelope(storage);
    const currentGeneration = readPrivateWriteGeneration(storage);
    return state.status === "stored" &&
      state.mode === "deleting" &&
      state.credential.userId === expectedUserId &&
      currentGeneration
      ? currentGeneration
      : null;
  });
  if (!generation) throw new WebAuthUnavailableError();
  terminalPrivateWriteCleanup = {
    generation,
    handle,
    privateDataPurged: false,
    userId: expectedUserId,
  };
  try {
    return await operation();
  } finally {
    if (terminalPrivateWriteCleanup?.handle === handle) {
      terminalPrivateWriteCleanup = null;
    }
  }
}

/** Allows only removals within the live, exact deleting-subject cleanup. */
export function terminalWebPrivateWriteRemovalAllowed(): boolean {
  const cleanup = terminalPrivateWriteCleanup;
  const storage = localStorageSurface();
  if (
    !cleanup ||
    !storage ||
    !activeAccountOperations.has(cleanup.handle) ||
    readPrivateWriteGeneration(storage) !== cleanup.generation
  ) {
    return false;
  }
  const state = readEnvelope(storage);
  return (
    state.status === "stored" &&
    state.mode === "deleting" &&
    state.credential.userId === cleanup.userId
  );
}

/** Proves/purges every private namespace before terminal credential cleanup. */
export async function confirmTerminalWebPrivateDataPurge(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  proveOrPurge: () => Promise<boolean>,
): Promise<boolean> {
  requireAccountOperation(handle);
  if (!terminalWebPrivateWriteRemovalAllowed()) return false;
  try {
    if (!(await proveOrPurge())) return false;
  } catch {
    return false;
  }
  return withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const cleanup = terminalPrivateWriteCleanup;
    if (
      !cleanup ||
      cleanup.handle !== handle ||
      cleanup.userId !== expectedUserId ||
      !terminalWebPrivateWriteRemovalAllowed() ||
      !scrubLegacyWebAuthCookies()
    ) {
      return false;
    }
    cleanup.privateDataPurged = true;
    return legacyWebAuthCookiesAreAbsent();
  });
}

/** Proves the current deleting subject owns a completed private-data purge. */
function terminalWebPrivateDataPurgeIsConfirmed(
  expectedUserId: string,
): boolean {
  const cleanup = terminalPrivateWriteCleanup;
  const storage = localStorageSurface();
  if (
    !cleanup?.privateDataPurged ||
    !storage ||
    cleanup.userId !== expectedUserId ||
    !activeAccountOperations.has(cleanup.handle) ||
    readPrivateWriteGeneration(storage) !== cleanup.generation
  ) {
    return false;
  }
  const state = readEnvelope(storage);
  return (
    state.status === "stored" &&
    state.mode === "deleting" &&
    state.credential.userId === expectedUserId
  );
}

/** Rotates, purges, and conditionally reopens one exact active owner. */
export async function withActiveWebPrivateWriteReset(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  requireAccountOperation(handle);
  if (activePrivateWriteReset) throw new WebAuthUnavailableError();
  const generation = await withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const storage = localStorageSurface();
    if (!storage) return null;
    const state = readEnvelope(storage);
    if (
      state.status !== "stored" ||
      state.mode !== "active" ||
      state.credential.userId !== expectedUserId
    ) {
      return null;
    }
    return rotatePrivateWriteGeneration(storage);
  });
  if (!generation) throw new WebAuthUnavailableError();
  publishAuthStorageChange();
  activePrivateWriteReset = { generation, handle, userId: expectedUserId };
  let complete = false;
  try {
    if (!(await operation())) return false;
    const adoptedSessionId = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return null;
      const state = readEnvelope(storage);
      return (
        state.status === "stored" &&
        state.mode === "active" &&
        state.credential.userId === expectedUserId &&
        readPrivateWriteGeneration(storage) === generation &&
        readWebPrivateNamespaceState(storage) === "v2" &&
        rawEquals(storage, WEB_V2_LAST_SYNC_USER_STORAGE_KEY, expectedUserId)
      )
        ? state.sessionId
        : null;
    });
    if (!adoptedSessionId) return false;
    adoptedPrivateWriteGeneration = generation;
    adoptedPrivateReadAuthority = {
      generation,
      kind: "account",
      sessionId: adoptedSessionId,
      userId: expectedUserId,
    };
    privateWriteGenerationInvalidated = false;
    if (
      !(await coordinateCurrentWebPrivateJourney()) ||
      !webPrivateReadAllowed()
    ) {
      revokeWebPrivateMemory();
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
      privateWriteGenerationInvalidated = true;
      return false;
    }
    complete = true;
    return true;
  } finally {
    if (activePrivateWriteReset?.handle === handle) {
      activePrivateWriteReset = null;
    }
    if (!complete) {
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
    }
  }
}

/** Allows reviewed active or deleting cleanup removes, never ordinary writes. */
export function reviewedWebPrivateWriteRemovalAllowed(): boolean {
  if (terminalWebPrivateWriteRemovalAllowed()) return true;
  const installingReset = installingPrivateWriteReset;
  const installingStorage = localStorageSurface();
  if (
    installingReset &&
    installingStorage &&
    activeAccountOperations.has(installingReset.handle) &&
    readPrivateWriteGeneration(installingStorage) ===
      installingReset.generation
  ) {
    const installingState = readEnvelope(installingStorage);
    if (
      installingState.status === "stored" &&
      installingState.mode === "installing" &&
      installingState.credential.userId === installingReset.userId
    ) {
      return true;
    }
  }
  const lockedReset = lockedLocalJourneyReset;
  const lockedStorage = localStorageSurface();
  if (
    lockedReset &&
    lockedStorage &&
    activeAccountOperations.has(lockedReset.handle) &&
    readPrivateWriteGeneration(lockedStorage) === lockedReset.generation &&
    readEnvelope(lockedStorage).status === "missing"
  ) {
    const owner = readLocalJourneyOwner(lockedStorage);
    if (owner.status === "owned" && owner.userId === lockedReset.userId) {
      return true;
    }
  }
  const reset = activePrivateWriteReset;
  const storage = localStorageSurface();
  if (
    !reset ||
    !storage ||
    !activeAccountOperations.has(reset.handle) ||
    readPrivateWriteGeneration(storage) !== reset.generation
  ) {
    return false;
  }
  const state = readEnvelope(storage);
  return (
    state.status === "stored" &&
    state.mode === "active" &&
    state.credential.userId === reset.userId
  );
}

/** Resolves the exact live cleanup context without exposing account material. */
function currentReviewedRemovalAuthority(): {
  context: object;
  generation: string;
} | null {
  if (
    terminalPrivateWriteCleanup &&
    terminalWebPrivateWriteRemovalAllowed()
  ) {
    return {
      context: terminalPrivateWriteCleanup,
      generation: terminalPrivateWriteCleanup.generation,
    };
  }
  if (
    installingPrivateWriteReset &&
    webPrivateFreshInstallResetAllowed(
      installingPrivateWriteReset.handle,
      installingPrivateWriteReset.userId,
    )
  ) {
    return {
      context: installingPrivateWriteReset,
      generation: installingPrivateWriteReset.generation,
    };
  }
  const locked = lockedLocalJourneyReset;
  const storage = localStorageSurface();
  if (
    locked &&
    storage &&
    activeAccountOperations.has(locked.handle) &&
    readPrivateWriteGeneration(storage) === locked.generation &&
    readEnvelope(storage).status === "missing"
  ) {
    const owner = readLocalJourneyOwner(storage);
    if (owner.status === "owned" && owner.userId === locked.userId) {
      return { context: locked, generation: locked.generation };
    }
  }
  if (
    activePrivateWriteReset &&
    webPrivateActiveResetCommitAllowed(
      activePrivateWriteReset.handle,
      activePrivateWriteReset.userId,
    )
  ) {
    return {
      context: activePrivateWriteReset,
      generation: activePrivateWriteReset.generation,
    };
  }
  return null;
}

/** Captures one exact reviewed removal authority before asynchronous queueing. */
export function beginReviewedWebPrivateRemoval(): WebPrivateRemovalGuard | null {
  const authority = currentReviewedRemovalAuthority();
  if (!authority) return null;
  const guard = {} as WebPrivateRemovalGuard;
  reviewedRemovalGuards.set(guard, authority);
  return guard;
}

/** Rejects a queued removal if any transition replaced its captured authority. */
export function webPrivateRemovalGuardIsCurrent(
  guard: WebPrivateRemovalGuard,
): boolean {
  const expected = reviewedRemovalGuards.get(guard);
  const current = currentReviewedRemovalAuthority();
  return Boolean(
    expected &&
      current &&
      expected.context === current.context &&
      expected.generation === current.generation,
  );
}

/** Rechecks exact installing-reset authority throughout async private purges. */
export function webPrivateFreshInstallResetAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): boolean {
  const reset = installingPrivateWriteReset;
  const storage = localStorageSurface();
  if (
    !reset ||
    !storage ||
    reset.handle !== handle ||
    reset.userId !== expectedUserId ||
    !activeAccountOperations.has(handle) ||
    readPrivateWriteGeneration(storage) !== reset.generation
  ) {
    return false;
  }
  const state = readEnvelope(storage);
  return (
    state.status === "stored" &&
    state.mode === "installing" &&
    state.credential.userId === expectedUserId
  );
}

/** Authorizes only exact ownership metadata before an active reset reopens. */
export function webPrivateActiveResetCommitAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): boolean {
  const reset = activePrivateWriteReset;
  const storage = localStorageSurface();
  if (
    !reset ||
    !storage ||
    reset.handle !== handle ||
    reset.userId !== expectedUserId ||
    !activeAccountOperations.has(handle) ||
    readPrivateWriteGeneration(storage) !== reset.generation
  ) {
    return false;
  }
  const state = readEnvelope(storage);
  return (
    state.status === "stored" &&
    state.mode === "active" &&
    state.credential.userId === expectedUserId
  );
}

/** Purges an exact signed-out owner before reopening durable guest writes. */
export async function withLockedLocalJourneyPrivateReset(
  handle: WebAccountOperationHandle,
  expectedOwnerUserId: string,
  purgeAllNamespaces: () => Promise<boolean>,
): Promise<boolean> {
  requireAccountOperation(handle);
  if (lockedLocalJourneyReset) throw new WebAuthUnavailableError();
  await requireCurrentWebAccountRealm(handle);
  const generation = await withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const storage = localStorageSurface();
    if (!storage || readEnvelope(storage).status !== "missing") return null;
    const owner = readLocalJourneyOwner(storage);
    if (owner.status !== "owned" || owner.userId !== expectedOwnerUserId) {
      return null;
    }
    return rotatePrivateWriteGeneration(storage);
  });
  if (!generation) throw new WebAuthUnavailableError();
  publishAuthStorageChange();
  lockedLocalJourneyReset = {
    generation,
    handle,
    userId: expectedOwnerUserId,
  };
  let complete = false;
  try {
    if (!(await purgeAllNamespaces())) return false;
    complete = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (
        !storage ||
        readPrivateWriteGeneration(storage) !== generation ||
        readEnvelope(storage).status !== "missing"
      ) {
        return false;
      }
      return commitNeverOwnedGuestAfterReviewedPurge(
        storage,
        expectedOwnerUserId,
      );
    });
    if (!complete) return false;
    adoptedPrivateWriteGeneration = generation;
    adoptedPrivateReadAuthority = { generation, kind: "guest" };
    privateWriteGenerationInvalidated = false;
    if (
      !(await coordinateCurrentWebPrivateJourney()) ||
      !webPrivateReadAllowed()
    ) {
      revokeWebPrivateMemory();
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
      complete = false;
      return false;
    }
    publishAuthStorageChange();
    return true;
  } finally {
    if (lockedLocalJourneyReset?.handle === handle) {
      lockedLocalJourneyReset = null;
    }
    if (!complete) {
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
    }
  }
}

/** Proves one locked cutover still owns the exact provisional credential. */
export function webPrivateInstallCutoverAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): boolean {
  const storage = localStorageSurface();
  if (
    !storage ||
    !webAccountRealmAttested ||
    !activeAccountOperations.has(handle)
  ) {
    return false;
  }
  const generation = readPrivateWriteGeneration(storage);
  const state = readEnvelope(storage);
  return Boolean(
    generation &&
      privateWriteGenerationObservation.status === "observed" &&
      privateWriteGenerationObservation.generation === generation &&
      state.status === "stored" &&
      state.mode === "installing" &&
      state.credential.userId === expectedUserId,
  );
}

/** Grants reviewed installing hydration only after the exact v2 owner contract. */
export function webPrivateInstallingReadAllowed(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
  storage: Pick<Storage, "getItem"> | null = localStorageSurface(),
): boolean {
  if (
    !storage ||
    !webAccountRealmAttested ||
    !activeAccountOperations.has(handle) ||
    readWebPrivateNamespaceState(storage) !== "v2"
  ) {
    return false;
  }
  const generation = readPrivateWriteGeneration(storage);
  const state = readEnvelope(storage);
  const claim = readRaw(storage, WEB_V2_LOCAL_CLAIM_PENDING_STORAGE_KEY);
  return Boolean(
    generation &&
      privateWriteGenerationObservation.status === "observed" &&
      privateWriteGenerationObservation.generation === generation &&
      state.status === "stored" &&
      state.mode === "installing" &&
      state.credential.userId === expectedUserId &&
      rawEquals(storage, WEB_V2_LAST_SYNC_USER_STORAGE_KEY, expectedUserId) &&
      rawEquals(
        storage,
        WEB_V2_INITIAL_SYNC_PENDING_STORAGE_KEY,
        expectedUserId,
      ) &&
      (claim.status === "missing" ||
        (claim.status === "read" && claim.value === expectedUserId)) &&
      readRaw(storage, WEB_V2_GUEST_PROVENANCE_STORAGE_KEY).status === "missing"
  );
}

/** Rechecks a write generation and terminal mode after one synchronous write. */
export function webPrivateWriteGuardIsCurrent(
  guard: WebPrivateWriteGuard,
): boolean {
  const storage = localStorageSurface();
  if (
    !storage ||
    adoptedPrivateWriteGeneration !== guard.generation ||
    readPrivateWriteGeneration(storage) !== guard.generation
  ) {
    return false;
  }
  return webPrivateReadAllowed(storage);
}

/** Returns the exact active bearer or null, and throws on unsafe ambiguity. */
export async function readActiveWebAuthSession(
  handle?: WebAccountOperationHandle,
): Promise<ExactNativeAuthSession | null> {
  const state = await readWebAuthState(handle);
  if (state.status === "missing") return null;
  if (state.status !== "stored" || state.mode !== "active") {
    throw new WebAuthUnavailableError();
  }
  if (!webAccountRealmAttested || !webPrivateReadAllowed()) {
    throw new WebAuthUnavailableError();
  }
  return state.credential;
}

/** Returns the full active SDK session for verified client reconciliation. */
export async function readActiveWebSession(
  handle?: WebAccountOperationHandle,
): Promise<Session | null> {
  const state = await readWebAuthState(handle);
  if (state.status === "missing") return null;
  if (state.status !== "stored" || state.mode !== "active") {
    throw new WebAuthUnavailableError();
  }
  if (!webAccountRealmAttested || !webPrivateReadAllowed()) {
    throw new WebAuthUnavailableError();
  }
  return state.session;
}

/** Reads one expected retained session in an explicitly allowed operation mode. */
export async function readExpectedWebAuthSession(
  expectedUserId: string,
  allowedModes: readonly WebAuthMode[],
  handle?: WebAccountOperationHandle,
): Promise<ExactNativeAuthSession> {
  const state = await readWebAuthState(handle);
  if (
    state.status !== "stored" ||
    state.credential.userId !== expectedUserId ||
    !allowedModes.includes(state.mode)
  ) {
    throw new WebAuthUnavailableError();
  }
  return state.credential;
}

/** Reads the staged source owner while exact installing authority remains live. */
async function installingSourceOwnerDisposition(
  expectedUserId: string,
  handle: WebAccountOperationHandle,
): Promise<import("@/lib/storage/web-private-cutover").WebPrivateSourceOwnerDisposition> {
  const { readWebPrivateSourceOwnerDisposition } = await import(
    "@/lib/storage/web-private-cutover"
  );
  return readWebPrivateSourceOwnerDisposition(
    expectedUserId,
    handle,
  );
}

/** Durably binds one content-free install choice to the exact provisional session. */
async function commitInstallingWebSessionIntent(
  handle: WebAccountOperationHandle,
  candidate: ParsedSession,
  intent: WebAuthInstallIntent,
): Promise<WebAuthInstallIntent | null> {
  return withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const storage = localStorageSurface();
    if (!storage) return null;
    const current = readEnvelope(storage);
    if (
      current.status !== "stored" ||
      current.mode !== "installing" ||
      current.sessionId !== candidate.sessionId ||
      !exactCredentialMatches(current.credential, candidate.credential)
    ) {
      return null;
    }
    if (current.installIntent) return current.installIntent;
    if (!writeEnvelope(storage, "installing", current.session, intent)) {
      return null;
    }
    const confirmed = readEnvelope(storage);
    return confirmed.status === "stored" &&
      confirmed.mode === "installing" &&
      confirmed.installIntent === intent &&
      confirmed.sessionId === candidate.sessionId &&
      exactCredentialMatches(confirmed.credential, candidate.credential)
      ? intent
      : null;
  });
}

/** Coordinates hidden QuestOS reset/rehydration under exact installing authority. */
async function rehydrateInstalledWebPrivateJourney(
  handle: WebAccountOperationHandle,
  userId: string,
): Promise<boolean> {
  try {
    const { coordinateQuestOSWebPrivateHydration } = await import(
      "@/lib/questos/store"
    );
    return coordinateQuestOSWebPrivateHydration({
      kind: "installing",
      handle,
      userId,
    });
  } catch {
    return false;
  }
}

/** Rotates and retains exact installing authority through a reviewed fresh purge. */
async function resetFreshInstallingWebPrivateData(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): Promise<boolean> {
  requireAccountOperation(handle);
  if (installingPrivateWriteReset) throw new WebAuthUnavailableError();
  const generation = await withWebAuthStorageLock(async () => {
    requireAccountOperation(handle);
    const storage = localStorageSurface();
    if (!storage) return null;
    const state = readEnvelope(storage);
    if (
      state.status !== "stored" ||
      state.mode !== "installing" ||
      state.credential.userId !== expectedUserId
    ) {
      return null;
    }
    return rotatePrivateWriteGeneration(storage);
  });
  if (!generation) throw new WebAuthUnavailableError();
  publishAuthStorageChange();
  installingPrivateWriteReset = {
    generation,
    handle,
    userId: expectedUserId,
  };
  try {
    const { purgeAndCommitFreshWebPrivateInstall } = await import(
      "@/lib/storage/web-private-cutover"
    );
    if (
      !(await purgeAndCommitFreshWebPrivateInstall(handle, expectedUserId))
    ) {
      return false;
    }
    return webPrivateFreshInstallResetAllowed(handle, expectedUserId);
  } finally {
    if (installingPrivateWriteReset?.handle === handle) {
      installingPrivateWriteReset = null;
    }
  }
}

/** Resumes one provisional install through private cutover and exact activation. */
export async function resumeInstallingWebSession(
  handle: WebAccountOperationHandle,
  authorization: InstallingWebSessionAuthorization = "automatic",
): Promise<InstallingWebSessionResolution> {
  requireAccountOperation(handle);
  try {
    await requireCurrentWebAccountRealm(handle);
    const before = await readWebAuthState(handle);
    if (before.status !== "stored" || before.mode !== "installing") {
      return "unavailable";
    }
    const candidate = parsedSession(before.session);
    if (!candidate || (await verifyParsedSession(candidate)) !== "active") {
      return "unavailable";
    }
    const cutoverModule = await import("@/lib/storage/web-private-cutover");
    let installIntent = before.installIntent;
    if (!installIntent) {
      if (authorization === "explicit-start-fresh") {
        installIntent = "fresh";
      } else {
        const disposition = await installingSourceOwnerDisposition(
          candidate.credential.userId,
          handle,
        );
        if (disposition === "unavailable") return "unavailable";
        if (authorization === "automatic" && disposition !== "exact-owner") {
          return "choice-required";
        }
        installIntent = "keep";
      }
      const committedIntent = await commitInstallingWebSessionIntent(
        handle,
        candidate,
        installIntent,
      );
      if (!committedIntent) return "unavailable";
      installIntent = committedIntent;
    }
    if (installIntent === "fresh") {
      if (
        !(await resetFreshInstallingWebPrivateData(
          handle,
          candidate.credential.userId,
        ))
      ) {
        return "unavailable";
      }
    } else {
      const cutover = await cutoverModule.cutoverLegacyWebPrivateDataToV2(
        candidate.credential.userId,
        handle,
      );
      if (
        cutover === "unavailable" ||
        cutoverModule.readLegacyWebPrivateCutoverState() !== "committed" ||
        !(await cutoverModule.commitWebPrivateHandoffOwner(
          handle,
          candidate.credential.userId,
          true,
        ))
      ) {
        return "unavailable";
      }
    }
    if (
      (await cutoverModule.readWebPrivateHandoffCommitState(
        handle,
        candidate.credential.userId,
      )) !== installIntent ||
      !webPrivateInstallingReadAllowed(handle, candidate.credential.userId)
    ) {
      return "unavailable";
    }
    if (
      !(await rehydrateInstalledWebPrivateJourney(
        handle,
        candidate.credential.userId,
      ))
    ) {
      return "unavailable";
    }
    // The selected v2 owner must bind the rehydrated journey to this user.
    if (
      (await cutoverModule.readWebPrivateSourceOwnerDisposition(
        candidate.credential.userId,
        handle,
      )) !== "exact-owner"
    ) {
      return "unavailable";
    }

    let activatedGeneration: string | null = null;
    const activated = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return false;
      const current = readEnvelope(storage);
      if (
        current.status !== "stored" ||
        current.mode !== "installing" ||
        current.sessionId !== candidate.sessionId ||
        !exactCredentialMatches(current.credential, candidate.credential)
      ) {
        return false;
      }
      const generation = readPrivateWriteGeneration(storage);
      if (
        !generation ||
        privateWriteGenerationObservation.status !== "observed" ||
        privateWriteGenerationObservation.generation !== generation ||
        !scrubLegacyWebAuthCookies() ||
        !writeRaw(
          storage,
          WEB_AUTH_V2_MIGRATION_KEY,
          WEB_AUTH_V2_MIGRATION_COMPLETE,
        ) ||
        !writeEnvelope(storage, "active", current.session)
      ) {
        return false;
      }
      const confirmed = readEnvelope(storage);
      if (
        confirmed.status !== "stored" ||
        confirmed.mode !== "active" ||
        confirmed.sessionId !== candidate.sessionId ||
        !exactCredentialMatches(confirmed.credential, candidate.credential)
      ) {
        return false;
      }
      activatedGeneration = generation;
      return true;
    });
    if (!activated || !activatedGeneration) return "unavailable";
    adoptedPrivateWriteGeneration = activatedGeneration;
    adoptedPrivateReadAuthority = {
      generation: activatedGeneration,
      kind: "account",
      sessionId: candidate.sessionId,
      userId: candidate.credential.userId,
    };
    privateWriteGenerationInvalidated = false;
    if (!webPrivateReadAllowed()) {
      revokeWebPrivateMemory();
      adoptedPrivateWriteGeneration = null;
      adoptedPrivateReadAuthority = null;
      privateWriteGenerationInvalidated = true;
      return "unavailable";
    }
    publishAuthStorageChange();
    return "activated";
  } catch {
    return "unavailable";
  }
}

/** Installs one server-verified candidate only into a still-empty v2 slot. */
export async function installVerifiedWebSession(
  handle: WebAccountOperationHandle,
  candidateSession: Session,
  source: WebSessionInstallSource,
): Promise<WebSessionInstallResult> {
  requireAccountOperation(handle);
  void source;
  try {
    await requireCurrentWebAccountRealm(handle);
  } catch {
    return "unavailable";
  }
  const candidate = parsedSession(candidateSession);
  if (!candidate) return "invalid";
  try {
    let generationChanged = false;
    const result = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return "unavailable" as const;
      const current = readEnvelope(storage);
      if (current.status === "stored") return "occupied" as const;
      if (current.status === "unavailable") return "unavailable" as const;
      const marker = readRaw(storage, WEB_AUTH_V2_MIGRATION_KEY);
      if (
        marker.status === "unavailable" ||
        (marker.status === "read" &&
          marker.value !== WEB_AUTH_V2_MIGRATION_COMPLETE)
      ) {
        return "unavailable" as const;
      }
      if (marker.status === "missing") {
        const legacy = await legacyCookieSession();
        if (legacy.status === "stored") return "occupied" as const;
        if (legacy.status !== "missing") return "unavailable" as const;
      }
      const verification = await verifyParsedSession(candidate);
      if (verification !== "active") {
        return verification === "unavailable"
          ? ("unavailable" as const)
          : ("invalid" as const);
      }
      const generation = rotatePrivateWriteGeneration(storage);
      if (!generation) return "unavailable" as const;
      generationChanged = true;
      if (!writeEnvelope(storage, "installing", candidate.session)) {
        return "unavailable" as const;
      }
      return "recovery-required" as const;
    });
    if (generationChanged) publishAuthStorageChange();
    if (result === "recovery-required") {
      const resumed = await resumeInstallingWebSession(handle);
      return resumed === "activated" ? "installed" : "recovery-required";
    }
    return result;
  } catch {
    return "unavailable";
  }
}

/** Marks one exact active credential before irreversible account work starts. */
async function markWebAuthMode(
  handle: WebAccountOperationHandle,
  expected: ExactNativeAuthSession,
  mode: "deleting" | "signing-out",
): Promise<WebSessionMarkResult> {
  requireAccountOperation(handle);
  try {
    // Re-attest every live web realm at the irreversible terminal edge.
    await requireCurrentWebAccountRealm(handle);
    let generationChanged = false;
    const result = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return "unavailable" as const;
      const current = readEnvelope(storage);
      if (current.status === "missing") return "missing" as const;
      if (current.status !== "stored") return "unavailable" as const;
      if (!exactCredentialMatches(current.credential, expected)) {
        return "different-session" as const;
      }
      if (current.mode === mode) return "marked" as const;
      if (current.mode !== "active") return "different-state" as const;
      if (!rotatePrivateWriteGeneration(storage)) {
        return "unavailable" as const;
      }
      generationChanged = true;
      return writeEnvelope(storage, mode, current.session)
        ? ("marked" as const)
        : ("unavailable" as const);
    });
    if (result === "marked") webAccountRealmAttested = false;
    if (result === "marked" || generationChanged) {
      publishAuthStorageChange();
    }
    return result;
  } catch {
    return "unavailable";
  }
}

/** Persists the durable deletion-resume state before remote dispatch. */
export function markWebAccountDeleting(
  handle: WebAccountOperationHandle,
  expected: ExactNativeAuthSession,
): Promise<WebSessionMarkResult> {
  return markWebAuthMode(handle, expected, "deleting");
}

/** Persists the durable sign-out-resume state before remote revocation. */
export function markWebAccountSigningOut(
  handle: WebAccountOperationHandle,
  expected: ExactNativeAuthSession,
): Promise<WebSessionMarkResult> {
  return markWebAuthMode(handle, expected, "signing-out");
}

/** Audits rollback residue and removes only one exact active credential. */
export async function clearExactWebAuthSession(
  handle: WebAccountOperationHandle,
  expected: ExactNativeAuthSession,
): Promise<ExactCredentialClearResult> {
  try {
    requireAccountOperation(handle);
    await requireCurrentWebAccountRealm(handle);
    const preflight = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return "unavailable" as const;
      const current = readEnvelope(storage);
      if (current.status === "missing") {
        return legacyWebAuthCookiesAreAbsent() &&
            rawEquals(
              storage,
              WEB_AUTH_V2_MIGRATION_KEY,
              WEB_AUTH_V2_MIGRATION_COMPLETE,
            )
          ? ("missing" as const)
          : ("unavailable" as const);
      }
      if (current.status !== "stored") return "unavailable" as const;
      if (!exactCredentialMatches(current.credential, expected)) {
        return "different-session" as const;
      }
      return current.mode === "active"
        ? ("matched" as const)
        : ("unavailable" as const);
    });
    if (preflight !== "matched") return preflight;

    const { removeAndProveLegacyWebPrivateResidue } = await import(
      "@/lib/storage/web-private-cutover"
    );
    if (
      !(await withWebPrivateLegacyAbsenceAudit(
        handle,
        expected.userId,
        () => removeAndProveLegacyWebPrivateResidue(handle, expected.userId),
      ))
    ) {
      return "unavailable";
    }

    let generationChanged = false;
    const result = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return "unavailable" as const;
      const current = readEnvelope(storage);
      if (current.status === "missing") return "unavailable" as const;
      if (current.status !== "stored") return "unavailable" as const;
      if (!exactCredentialMatches(current.credential, expected)) {
        return "different-session" as const;
      }
      if (
        current.mode !== "active" ||
        !legacyAbsenceClearIsConfirmed(handle, expected.userId, "active")
      ) {
        return "unavailable" as const;
      }
      if (!rotatePrivateWriteGeneration(storage)) {
        return "unavailable" as const;
      }
      generationChanged = true;
      return writeRaw(
        storage,
        WEB_AUTH_V2_MIGRATION_KEY,
        WEB_AUTH_V2_MIGRATION_COMPLETE,
      ) && removeRaw(storage, WEB_AUTH_V2_KEY) && removePkceState(storage)
        ? ("cleared" as const)
        : ("unavailable" as const);
    });
    if (result === "cleared" || generationChanged) {
      webAccountRealmAttested = false;
      publishAuthStorageChange();
    }
    if (legacyAbsenceClearProof?.handle === handle) {
      legacyAbsenceClearProof = null;
    }
    return result;
  } catch {
    if (legacyAbsenceClearProof?.handle === handle) {
      legacyAbsenceClearProof = null;
    }
    return "unavailable";
  }
}

/** Clears one retained operation subject while preserving a different user. */
async function clearWebAuthSubject(
  expectedUserId: string,
  expectedMode: "deleting" | "signing-out",
  handle?: WebAccountOperationHandle,
): Promise<SubjectClearResult> {
  try {
    if (expectedMode === "signing-out") {
      if (!handle) return "unavailable";
      requireAccountOperation(handle);
    }
    let generationChanged = false;
    const result = await withWebAuthStorageLock(async () => {
      if (handle) requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return "unavailable" as const;
      const current = readEnvelope(storage);
      if (current.status === "missing") {
        return legacyWebAuthCookiesAreAbsent() &&
            rawEquals(
              storage,
              WEB_AUTH_V2_MIGRATION_KEY,
              WEB_AUTH_V2_MIGRATION_COMPLETE,
            )
          ? ("missing" as const)
          : ("unavailable" as const);
      }
      if (current.status !== "stored") return "unavailable" as const;
      if (current.credential.userId !== expectedUserId) {
        return "different-user" as const;
      }
      if (current.mode !== expectedMode) return "unavailable" as const;
      if (
        expectedMode === "deleting" &&
        !terminalWebPrivateDataPurgeIsConfirmed(expectedUserId)
      ) {
        return "unavailable" as const;
      }
      if (
        expectedMode === "signing-out" &&
        (!handle ||
          !legacyAbsenceClearIsConfirmed(
            handle,
            expectedUserId,
            "signing-out",
          ))
      ) {
        return "unavailable" as const;
      }
      if (!rotatePrivateWriteGeneration(storage)) {
        return "unavailable" as const;
      }
      generationChanged = true;
      return writeRaw(
        storage,
        WEB_AUTH_V2_MIGRATION_KEY,
        WEB_AUTH_V2_MIGRATION_COMPLETE,
      ) && removeRaw(storage, WEB_AUTH_V2_KEY) && removePkceState(storage)
        ? ("cleared" as const)
        : ("unavailable" as const);
    });
    if (result === "cleared" || generationChanged) {
      webAccountRealmAttested = false;
      publishAuthStorageChange();
    }
    if (handle && legacyAbsenceClearProof?.handle === handle) {
      legacyAbsenceClearProof = null;
    }
    return result;
  } catch {
    if (handle && legacyAbsenceClearProof?.handle === handle) {
      legacyAbsenceClearProof = null;
    }
    return "unavailable";
  }
}

/** Clears only the exact subject already marked signing out. */
export function clearRevokedWebAuthSubject(
  handle: WebAccountOperationHandle,
  expectedUserId: string,
): Promise<SubjectClearResult> {
  return clearWebAuthSubject(expectedUserId, "signing-out", handle);
}

/** Clears only the exact subject already marked deleting. */
export function clearExpectedWebAuthSubject(
  expectedUserId: string,
): Promise<SubjectClearResult> {
  return clearWebAuthSubject(expectedUserId, "deleting");
}

/** Matches the one legacy Supabase cookie key for this public origin. */
function legacyStorageKey(): string | null {
  try {
    const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!origin) return null;
    const url = new URL(origin);
    const project = url.hostname.split(".")[0];
    return project ? `sb-${project}-auth-token` : null;
  } catch {
    return null;
  }
}

/** Reads the complete legacy cookie once for verified v1 migration. */
async function legacyCookieSession(): Promise<LegacyCookieRead> {
  if (typeof document === "undefined") return { status: "missing" };
  const storageKey = legacyStorageKey();
  if (!storageKey) return { status: "unavailable" };
  try {
    const values = parse(document.cookie);
    const hasLegacyCookie = Object.keys(values).some((name) =>
      isChunkLike(name, storageKey),
    );
    if (!hasLegacyCookie) return { status: "missing" };
    const chunked = await combineChunks(
      storageKey,
      (name) => values[name] ?? null,
    );
    if (!chunked) return { status: "invalid" };
    const value = chunked.startsWith(BASE64_PREFIX)
      ? stringFromBase64URL(chunked.slice(BASE64_PREFIX.length))
      : chunked;
    const session = parsedSession(JSON.parse(value));
    return session
      ? { status: "stored", session }
      : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

/** Proves no rollback-readable legacy credential chunk remains. */
function legacyWebAuthCookiesAreAbsent(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const names = Object.keys(parse(document.cookie));
    // Observed absence is proof: a document carrying no cookies at all cannot
    // be carrying a legacy auth cookie, whether or not the legacy key name can
    // be derived. Requiring the key name first made a first visit — which has
    // no cookies to remove — report failure and blocked guest adoption.
    if (names.length === 0) return true;
    const storageKey = legacyStorageKey();
    if (!storageKey) return false;
    return !names.some((name) => isChunkLike(name, storageKey));
  } catch {
    return false;
  }
}

/** Scrubs every legacy cookie chunk only after private-data absence proof. */
function scrubLegacyWebAuthCookies(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const values = parse(document.cookie);
    // Nothing to scrub is success, not failure. See the note in
    // legacyWebAuthCookiesAreAbsent.
    if (Object.keys(values).length === 0) return true;
    const storageKey = legacyStorageKey();
    if (!storageKey) return false;
    const options = { ...DEFAULT_COOKIE_OPTIONS, maxAge: 0 };
    for (const name of Object.keys(values)) {
      if (isChunkLike(name, storageKey)) {
        document.cookie = serialize(name, "", options);
      }
    }
    return legacyWebAuthCookiesAreAbsent();
  } catch {
    return false;
  }
}

/** Proves a lockless guest fallback has no v2 or legacy credential bytes. */
export function webAuthStorageIsGenuinelyEmpty(): boolean {
  const storage = localStorageSurface();
  if (!storage || readRaw(storage, WEB_AUTH_V2_KEY).status !== "missing") {
    return false;
  }
  if (typeof document === "undefined") return false;
  const storageKey = legacyStorageKey();
  if (!storageKey) return false;
  try {
    return !Object.keys(parse(document.cookie)).some((name) =>
      isChunkLike(name, storageKey),
    );
  } catch {
    return false;
  }
}

/** Verifies and completion-marks the one-time legacy-cookie migration. */
export async function migrateLegacyWebSession(
  handle: WebAccountOperationHandle,
): Promise<LegacyWebAuthMigrationResult> {
  requireAccountOperation(handle);
  try {
    await requireCurrentWebAccountRealm(handle);
  } catch {
    return "unavailable";
  }
  try {
    const existing = await readWebAuthState(handle);
    if (existing.status === "stored" && existing.mode === "installing") {
      const resumed = await resumeInstallingWebSession(handle);
      return resumed === "activated" ? "installed" : "recovery-required";
    }
    let generationChanged = false;
    const result = await withWebAuthStorageLock(async () => {
      requireAccountOperation(handle);
      const storage = localStorageSurface();
      if (!storage) return "unavailable" as const;
      const marker = readRaw(storage, WEB_AUTH_V2_MIGRATION_KEY);
      const current = readEnvelope(storage);
      if (marker.status === "read") {
        return marker.value === WEB_AUTH_V2_MIGRATION_COMPLETE
          ? ("already-complete" as const)
          : ("unavailable" as const);
      }
      if (marker.status === "unavailable" || current.status === "unavailable") {
        return "unavailable" as const;
      }
      if (current.status === "stored") {
        return "unavailable" as const;
      }

      const legacy = await legacyCookieSession();
      if (legacy.status === "missing") {
        return writeRaw(
          storage,
          WEB_AUTH_V2_MIGRATION_KEY,
          WEB_AUTH_V2_MIGRATION_COMPLETE,
        )
          ? ("empty" as const)
          : ("unavailable" as const);
      }
      if (legacy.status !== "stored") return legacy.status;
      const candidate = legacy.session;
      const verification = await verifyParsedSession(candidate);
      if (verification !== "active") {
        return verification === "unavailable"
          ? ("unavailable" as const)
          : ("invalid" as const);
      }
      const confirmed = await legacyCookieSession();
      if (
        confirmed.status !== "stored" ||
        confirmed.session.sessionId !== candidate.sessionId ||
        !exactCredentialMatches(
          confirmed.session.credential,
          candidate.credential,
        )
      ) {
        return "unavailable" as const;
      }
      const generation = rotatePrivateWriteGeneration(storage);
      if (!generation) return "unavailable" as const;
      generationChanged = true;
      if (!writeEnvelope(storage, "installing", candidate.session)) {
        return "unavailable" as const;
      }
      return "recovery-required" as const;
    });
    if (generationChanged) publishAuthStorageChange();
    if (result === "recovery-required") {
      const resumed = await resumeInstallingWebSession(handle);
      return resumed === "activated" ? "installed" : "recovery-required";
    }
    return result;
  } catch {
    return "unavailable";
  }
}

/** Temporarily suppresses auth-js's token-bearing BroadcastChannel constructor. */
export function constructWithoutAuthBroadcast<T>(construct: () => T): T {
  const scope = globalThis as typeof globalThis & {
    BroadcastChannel?: typeof BroadcastChannel;
  };
  const hadOwn = Object.prototype.hasOwnProperty.call(scope, "BroadcastChannel");
  const descriptor = Object.getOwnPropertyDescriptor(scope, "BroadcastChannel");
  let constructed = false;
  let result: T | undefined;
  try {
    Object.defineProperty(scope, "BroadcastChannel", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    if (scope.BroadcastChannel !== undefined) throw new WebAuthUnavailableError();
    result = construct();
    constructed = true;
  } catch (error) {
    if (error instanceof WebAuthUnavailableError) throw error;
    throw new WebAuthUnavailableError();
  } finally {
    try {
      if (hadOwn && descriptor) {
        Object.defineProperty(scope, "BroadcastChannel", descriptor);
      } else {
        Reflect.deleteProperty(scope, "BroadcastChannel");
      }
      const restored = Object.getOwnPropertyDescriptor(
        scope,
        "BroadcastChannel",
      );
      const exactRestore = hadOwn
        ? Boolean(
            descriptor &&
              restored &&
              descriptor.configurable === restored.configurable &&
              descriptor.enumerable === restored.enumerable &&
              ("value" in descriptor
                ? "value" in restored &&
                  descriptor.value === restored.value &&
                  descriptor.writable === restored.writable
                : "get" in restored &&
                  descriptor.get === restored.get &&
                  descriptor.set === restored.set),
          )
        : !Object.prototype.hasOwnProperty.call(scope, "BroadcastChannel");
      if (!exactRestore) throw new WebAuthUnavailableError();
    } catch {
      // A failed restoration is unrecoverable for account auth in this realm.
      throw new WebAuthUnavailableError();
    }
  }
  if (!constructed) throw new WebAuthUnavailableError();
  return result as T;
}

/** Builds exchange-only storage that can consume PKCE but cannot commit primary. */
function oauthExchangeStorage(
  handle: WebAccountOperationHandle,
): StrictStorage {
  let memoryPrimary: string | null = null;
  const strict = createStrictWebAuthStorage();
  return {
    getItem(key) {
      requireAccountOperation(handle);
      return key === WEB_AUTH_V2_KEY ? memoryPrimary : strict.getItem(key);
    },
    setItem(key, value) {
      requireAccountOperation(handle);
      if (key === WEB_AUTH_V2_KEY) {
        memoryPrimary = value;
        return;
      }
      return strict.setItem(key, value);
    },
    removeItem(key) {
      requireAccountOperation(handle);
      if (key === WEB_AUTH_V2_KEY) {
        memoryPrimary = null;
        return;
      }
      return strict.removeItem(key);
    },
  };
}

/** Exchanges one bounded PKCE code and direct-installs only into an empty slot. */
export async function completeVerifiedWebOAuth(
  code: string,
  handle: WebAccountOperationHandle,
): Promise<void> {
  requireAccountOperation(handle);
  await requireCurrentWebAccountRealm(handle);
  if (!code || code.length > 4_096 || !/^[\x21-\x7e]+$/.test(code)) {
    throw new WebAuthUnavailableError();
  }
  const before = await readWebAuthState(handle);
  if (before.status !== "missing") throw new WebAuthUnavailableError();
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = supabasePublishableKey();
  if (!origin || !publishableKey) throw new WebAuthUnavailableError();
  isolatedVerifierSequence += 1;
  const exchange = constructWithoutAuthBroadcast(() =>
    createSupabaseClient(origin, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "pkce",
        storageKey: WEB_AUTH_V2_KEY,
        storage: oauthExchangeStorage(handle),
        lock: strictWebAuthSdkLock,
      },
      global: {
        headers: {
          [WEB_AUTH_PROTOCOL_HEADER]: WEB_AUTH_PROTOCOL_VERSION,
        },
      },
    }),
  );
  const result = await withDeadline(
    exchange.auth.exchangeCodeForSession(code),
    AUTH_VERIFICATION_DEADLINE_MS,
    "Browser OAuth completion",
  );
  if (result.error || !result.data.session) {
    // Carry the provider's reason. Collapsing every cause into one error meant
    // a link finished in a different browser — the single most common and most
    // recoverable failure — was reported as "incomplete or invalid", so the
    // precise guidance this app already writes could never be reached.
    throw new WebOAuthCompletionError(result.error);
  }
  const installed = await installVerifiedWebSession(
    handle,
    result.data.session,
    "oauth",
  );
  if (installed !== "installed" && installed !== "recovery-required") {
    throw new WebAuthUnavailableError();
  }
}
