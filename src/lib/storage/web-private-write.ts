"use client";

import { isNativeTarget } from "@/lib/platform/target";
import {
  beginReviewedWebPrivateRemoval,
  beginWebPrivateWrite,
  captureWebPrivateReadLease,
  webPrivateRemovalGuardIsCurrent,
  webPrivateReadAllowed,
  webPrivateReadLeaseIsCurrent,
  webPrivateWriteGuardIsCurrent,
  withWebAuthStorageLock,
  type WebPrivateRemovalGuard,
  type WebPrivateReadLease,
  type WebPrivateWriteGuard,
} from "@/lib/supabase/web-auth-storage";

export interface WebPrivateMutation<T> {
  value: T;
  /** Reverts only the mutation performed by this callback before lock release. */
  rollback?: () => void | Promise<void>;
}

export type WebPrivateMutationResult<T> =
  | { committed: true; value: T }
  | { committed: false };

type PrivateStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export interface WebPrivateMutationOptions {
  /** Refuses a newer subject when this mutation derives from an earlier read. */
  expectedReadLease: WebPrivateReadLease | null;
  readStorage: Pick<Storage, "getItem">;
}

/** Identifies isolated fixtures without creating a production storage bypass. */
function isolatedTestFixtureStorage(testFixtureStorage: boolean): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    (testFixtureStorage || typeof document === "undefined")
  );
}

/** Grants private reads only to native, isolated tests, or the exact web lease. */
export function webPrivateStorageReadAllowed(
  storage: Pick<Storage, "getItem">,
  testFixtureStorage = false,
): boolean {
  return (
    isolatedTestFixtureStorage(testFixtureStorage) ||
    isNativeTarget() ||
    webPrivateReadAllowed(storage)
  );
}

/** Captures the core-owned lease; native and isolated fixtures use null. */
export function captureWebPrivateStorageReadLease(
  storage: Pick<Storage, "getItem">,
  testFixtureStorage = false,
): WebPrivateReadLease | null {
  if (
    isolatedTestFixtureStorage(testFixtureStorage) ||
    isNativeTarget()
  ) {
    return null;
  }
  const lease = captureWebPrivateReadLease(storage);
  return lease && webPrivateReadLeaseIsCurrent(lease, storage)
    ? lease
    : null;
}

/** Rechecks null only for native or isolated fixtures, never production web. */
export function webPrivateStorageReadLeaseIsCurrent(
  lease: WebPrivateReadLease | null,
  storage: Pick<Storage, "getItem">,
  testFixtureStorage = false,
): boolean {
  if (
    isolatedTestFixtureStorage(testFixtureStorage) ||
    isNativeTarget()
  ) {
    return true;
  }
  return Boolean(lease && webPrivateReadLeaseIsCurrent(lease, storage));
}

/**
 * Captures one browser-private generation before queueing, then serializes the
 * mutation with auth rotation so a delayed old caller cannot adopt a new owner.
 */
export async function withWebPrivateWriteGuard<T>(
  operation: (
    guard: WebPrivateWriteGuard | null,
  ) => WebPrivateMutation<T> | Promise<WebPrivateMutation<T>>,
  testFixtureStorage = false,
  options?: WebPrivateMutationOptions,
): Promise<WebPrivateMutationResult<T>> {
  // The fixture escape hatch is compile-time inert in every production build.
  const isolatedTestFixture = isolatedTestFixtureStorage(testFixtureStorage);
  if (isolatedTestFixture || isNativeTarget()) {
    try {
      const result = await operation(null);
      return { committed: true, value: result.value };
    } catch {
      return { committed: false };
    }
  }

  if (
    options &&
    !webPrivateStorageReadLeaseIsCurrent(
      options.expectedReadLease,
      options.readStorage,
    )
  ) {
    return { committed: false };
  }
  const guard = beginWebPrivateWrite();
  if (!guard) return { committed: false };
  try {
    return await withWebAuthStorageLock(async () => {
      if (
        !webPrivateWriteGuardIsCurrent(guard) ||
        (options &&
          !webPrivateStorageReadLeaseIsCurrent(
            options.expectedReadLease,
            options.readStorage,
          ))
      ) {
        return { committed: false } as const;
      }
      const result = await operation(guard);
      if (
        webPrivateWriteGuardIsCurrent(guard) &&
        (!options ||
          webPrivateStorageReadLeaseIsCurrent(
            options.expectedReadLease,
            options.readStorage,
          ))
      ) {
        return { committed: true, value: result.value } as const;
      }
      await result.rollback?.();
      return { committed: false } as const;
    });
  } catch {
    return { committed: false };
  }
}

/** Serializes one ordinary or explicitly reviewed private removal. */
export async function withWebPrivateRemovalGuard<T>(
  operation: (
    authorizationIsCurrent: () => boolean,
  ) => WebPrivateMutation<T> | Promise<WebPrivateMutation<T>>,
  testFixtureStorage = false,
  options?: WebPrivateMutationOptions,
): Promise<WebPrivateMutationResult<T>> {
  // The fixture escape hatch is compile-time inert in every production build.
  const isolatedTestFixture = isolatedTestFixtureStorage(testFixtureStorage);
  if (isolatedTestFixture || isNativeTarget()) {
    try {
      const result = await operation(() => true);
      return { committed: true, value: result.value };
    } catch {
      return { committed: false };
    }
  }

  if (
    options &&
    !webPrivateStorageReadLeaseIsCurrent(
      options.expectedReadLease,
      options.readStorage,
    )
  ) {
    return { committed: false };
  }
  const ordinaryGuard = beginWebPrivateWrite();
  const reviewedGuard: WebPrivateRemovalGuard | null = ordinaryGuard
    ? null
    : beginReviewedWebPrivateRemoval();
  if (!ordinaryGuard && !reviewedGuard) return { committed: false };
  try {
    return await withWebAuthStorageLock(async () => {
      const authorizationIsCurrent = ordinaryGuard
        ? () =>
            webPrivateWriteGuardIsCurrent(ordinaryGuard) &&
            (!options ||
              webPrivateStorageReadLeaseIsCurrent(
                options.expectedReadLease,
                options.readStorage,
              ))
        : () =>
            Boolean(
              reviewedGuard &&
                webPrivateRemovalGuardIsCurrent(reviewedGuard),
            );
      if (!authorizationIsCurrent()) return { committed: false } as const;
      const result = await operation(authorizationIsCurrent);
      if (authorizationIsCurrent()) {
        return { committed: true, value: result.value } as const;
      }
      await result.rollback?.();
      return { committed: false } as const;
    });
  } catch {
    return { committed: false };
  }
}

/** Writes and verifies one exact value while the web auth generation is held. */
export async function setWebPrivateStorageItem(
  storage: PrivateStorage,
  key: string,
  value: string,
  testFixtureStorage = false,
  expectedReadLease?: WebPrivateReadLease | null,
): Promise<boolean> {
  const result = await withWebPrivateWriteGuard(() => {
    const previous = storage.getItem(key);
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error("storage write failed");
    return {
      value: true,
      // The shared lock makes this rollback secondary to generation checks.
      rollback: () => {
        if (storage.getItem(key) !== value) return;
        if (previous === null) storage.removeItem(key);
        else storage.setItem(key, previous);
      },
    };
  }, testFixtureStorage, expectedReadLease === undefined
    ? undefined
    : { expectedReadLease, readStorage: storage });
  return result.committed && result.value;
}

/** Removes only the value re-read under the shared web auth generation lock. */
export async function removeWebPrivateStorageItem(
  storage: PrivateStorage,
  key: string,
  testFixtureStorage = false,
  expectedValue?: string | null,
  expectedReadLease?: WebPrivateReadLease | null,
): Promise<boolean> {
  const result = await withWebPrivateRemovalGuard(
    (authorizationIsCurrent) => {
      const previous = storage.getItem(key);
      if (expectedValue !== undefined && previous !== expectedValue) {
        return { value: false };
      }
      if (!authorizationIsCurrent()) return { value: false };
      storage.removeItem(key);
      if (storage.getItem(key) !== null) {
        throw new Error("storage removal failed");
      }
      return {
        value: true,
        // The shared lock prevents another owner from winning before rollback.
        rollback: () => {
          if (previous !== null && storage.getItem(key) === null) {
            storage.setItem(key, previous);
          }
        },
      };
    },
    testFixtureStorage,
    expectedReadLease === undefined
      ? undefined
      : { expectedReadLease, readStorage: storage },
  );
  return result.committed && result.value;
}
