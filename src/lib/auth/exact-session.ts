"use client";

import { isNativeTarget } from "@/lib/platform/target";
import {
  clearExactNativeAuthSession,
  type ExactCredentialClearResult,
  type ExactNativeAuthSession,
} from "@/lib/supabase/native-auth-storage";
import {
  clearExactWebAuthSession,
  type WebAccountOperationHandle,
} from "@/lib/supabase/web-auth-storage";

/** Clears one exact credential through the storage primitive for this platform. */
export function clearExactAuthSession(
  expected: ExactNativeAuthSession,
  webOperation?: WebAccountOperationHandle,
): Promise<ExactCredentialClearResult> {
  if (isNativeTarget()) return clearExactNativeAuthSession(expected);
  return webOperation
    ? clearExactWebAuthSession(webOperation, expected)
    : Promise.resolve("unavailable");
}

export type { ExactCredentialClearResult, ExactNativeAuthSession };
