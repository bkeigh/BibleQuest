"use client";

export interface DevicePrivateOperationHandle {
  readonly unavailable: true;
}

export interface DevicePrivateWriteGuard {
  readonly generation: "device";
}

export interface DevicePrivateReadLease {
  readonly generation: "device";
}

interface DevicePrivateRemovalGuard {
  readonly generation: "device";
}

export interface DevicePrivateMutation<T> {
  value: T;
  rollback?: () => void | Promise<void>;
}

export type DevicePrivateMutationResult<T> =
  | { committed: true; value: T }
  | { committed: false };

export interface DevicePrivateMutationOptions {
  expectedReadLease: DevicePrivateReadLease | null;
  readStorage: Pick<Storage, "getItem">;
}

type PrivateStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const WRITE_GUARD = Object.freeze({
  generation: "device",
}) as DevicePrivateWriteGuard;
const READ_LEASE = Object.freeze({
  generation: "device",
}) as DevicePrivateReadLease;
const REMOVAL_GUARD = Object.freeze({
  generation: "device",
}) as DevicePrivateRemovalGuard;

let storageOperations: Promise<void> = Promise.resolve();

/** Resolves the device storage surface without leaking access errors. */
function storageAvailable(): boolean {
  try {
    return Boolean(globalThis.localStorage);
  } catch {
    return false;
  }
}

/** Native persistence writes directly and needs no browser-owner generation. */
export function beginDevicePrivateWrite(): DevicePrivateWriteGuard | null {
  return storageAvailable() ? WRITE_GUARD : null;
}

/** Guest memory has no remote owner that can rotate underneath it. */
export function registerDevicePrivateMemoryReset(
  reset: () => void,
): () => void {
  void reset;
  return () => undefined;
}

/** No installing remote owner can read guest device data. */
export function devicePrivateInstallingReadAllowed(
  handle: DevicePrivateOperationHandle,
  expectedUserId: string,
  storage: Pick<Storage, "getItem">,
): boolean {
  void handle;
  void expectedUserId;
  void storage;
  return false;
}

/** Local guest reads require only an available device storage surface. */
export function devicePrivateReadAllowed(
  storage: Pick<Storage, "getItem">,
): boolean {
  try {
    void storage.getItem("");
    return true;
  } catch {
    return false;
  }
}

/** Accepts only the singleton issued for local device writes. */
export function devicePrivateWriteGuardIsCurrent(
  guard: DevicePrivateWriteGuard,
): boolean {
  return guard === WRITE_GUARD;
}

/** Serializes device storage work inside this JavaScript realm. */
export function withDevicePrivateStorageLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = storageOperations.then(operation, operation);
  storageOperations = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Allows a readable device storage surface without a browser account lease. */
export function devicePrivateStorageReadAllowed(
  storage: Pick<Storage, "getItem">,
  testFixtureStorage = false,
): boolean {
  void testFixtureStorage;
  return devicePrivateReadAllowed(storage);
}

/** Issues one local read lease when device storage is available. */
export function captureDevicePrivateStorageReadLease(
  storage: Pick<Storage, "getItem">,
  testFixtureStorage = false,
): DevicePrivateReadLease | null {
  void testFixtureStorage;
  return devicePrivateStorageReadAllowed(storage) ? READ_LEASE : null;
}

/** Rechecks the one local lease against the same readable surface. */
export function devicePrivateStorageReadLeaseIsCurrent(
  lease: DevicePrivateReadLease | null,
  storage: Pick<Storage, "getItem">,
  testFixtureStorage = false,
): boolean {
  void testFixtureStorage;
  return lease === READ_LEASE && devicePrivateStorageReadAllowed(storage);
}

/** Runs one device-local mutation and reports storage failures as refusal. */
export async function withDevicePrivateWriteGuard<T>(
  operation: (
    guard: DevicePrivateWriteGuard | null,
  ) => DevicePrivateMutation<T> | Promise<DevicePrivateMutation<T>>,
  testFixtureStorage = false,
  options?: DevicePrivateMutationOptions,
): Promise<DevicePrivateMutationResult<T>> {
  void testFixtureStorage;
  if (
    options &&
    !devicePrivateStorageReadLeaseIsCurrent(
      options.expectedReadLease,
      options.readStorage,
    )
  ) {
    return { committed: false };
  }
  try {
    const result = await operation(null);
    return { committed: true, value: result.value };
  } catch {
    return { committed: false };
  }
}

/** Runs one explicit device-local removal. */
export async function withDevicePrivateRemovalGuard<T>(
  operation: (
    authorizationIsCurrent: () => boolean,
  ) => DevicePrivateMutation<T> | Promise<DevicePrivateMutation<T>>,
  testFixtureStorage = false,
  options?: DevicePrivateMutationOptions,
): Promise<DevicePrivateMutationResult<T>> {
  void testFixtureStorage;
  if (
    options &&
    !devicePrivateStorageReadLeaseIsCurrent(
      options.expectedReadLease,
      options.readStorage,
    )
  ) {
    return { committed: false };
  }
  try {
    const result = await operation(() => REMOVAL_GUARD.generation === "device");
    return { committed: true, value: result.value };
  } catch {
    return { committed: false };
  }
}

/** Writes and verifies one exact device-local value. */
export async function setDevicePrivateStorageItem(
  storage: PrivateStorage,
  key: string,
  value: string,
  testFixtureStorage = false,
  expectedReadLease?: DevicePrivateReadLease | null,
): Promise<boolean> {
  const result = await withDevicePrivateWriteGuard(
    () => {
      storage.setItem(key, value);
      if (storage.getItem(key) !== value) throw new Error("write failed");
      return { value: true };
    },
    testFixtureStorage,
    expectedReadLease === undefined
      ? undefined
      : { expectedReadLease, readStorage: storage },
  );
  return result.committed && result.value;
}

/** Removes and verifies one exact device-local value. */
export async function removeDevicePrivateStorageItem(
  storage: PrivateStorage,
  key: string,
  testFixtureStorage = false,
  expectedValue?: string | null,
  expectedReadLease?: DevicePrivateReadLease | null,
): Promise<boolean> {
  const result = await withDevicePrivateRemovalGuard(
    (authorizationIsCurrent) => {
      const previous = storage.getItem(key);
      if (expectedValue !== undefined && previous !== expectedValue) {
        return { value: false };
      }
      if (!authorizationIsCurrent()) return { value: false };
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw new Error("removal failed");
      return { value: true };
    },
    testFixtureStorage,
    expectedReadLease === undefined
      ? undefined
      : { expectedReadLease, readStorage: storage },
  );
  return result.committed && result.value;
}
