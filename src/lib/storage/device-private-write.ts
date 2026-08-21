"use client";

import {
  captureWebPrivateStorageReadLease,
  removeWebPrivateStorageItem,
  setWebPrivateStorageItem,
  webPrivateStorageReadAllowed,
  webPrivateStorageReadLeaseIsCurrent,
  withWebPrivateRemovalGuard,
  withWebPrivateWriteGuard,
} from "./web-private-write";
import {
  beginWebPrivateWrite,
  registerWebPrivateMemoryReset,
  webPrivateInstallingReadAllowed,
  webPrivateReadAllowed,
  webPrivateWriteGuardIsCurrent,
  withWebAuthStorageLock,
  type WebAccountOperationHandle,
  type WebPrivateReadLease,
  type WebPrivateWriteGuard,
} from "@/lib/supabase/web-auth-storage";

export type DevicePrivateOperationHandle = WebAccountOperationHandle;
export type DevicePrivateReadLease = WebPrivateReadLease;
export type DevicePrivateWriteGuard = WebPrivateWriteGuard;

/** Gives device-data callers neutral names for the reviewed storage boundary. */
export const beginDevicePrivateWrite = beginWebPrivateWrite;
export const registerDevicePrivateMemoryReset = registerWebPrivateMemoryReset;
export const devicePrivateInstallingReadAllowed =
  webPrivateInstallingReadAllowed;
export const devicePrivateReadAllowed = webPrivateReadAllowed;
export const devicePrivateWriteGuardIsCurrent =
  webPrivateWriteGuardIsCurrent;
export const withDevicePrivateStorageLock = withWebAuthStorageLock;
export const captureDevicePrivateStorageReadLease =
  captureWebPrivateStorageReadLease;
export const removeDevicePrivateStorageItem = removeWebPrivateStorageItem;
export const setDevicePrivateStorageItem = setWebPrivateStorageItem;
export const devicePrivateStorageReadAllowed = webPrivateStorageReadAllowed;
export const devicePrivateStorageReadLeaseIsCurrent =
  webPrivateStorageReadLeaseIsCurrent;
export const withDevicePrivateRemovalGuard = withWebPrivateRemovalGuard;
export const withDevicePrivateWriteGuard = withWebPrivateWriteGuard;
