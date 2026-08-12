import { isNativeTarget } from "@/lib/platform/target";

/** Fail closed unless a reviewed build explicitly enables account sync. */
export function accountSyncContained(enabled: string | undefined): boolean {
  return enabled !== "true";
}

export const ACCOUNT_SYNC_CONTAINED = accountSyncContained(
  process.env.NEXT_PUBLIC_ACCOUNT_SYNC_ENABLED,
);

/** Native account traffic requires the separate deterministic beta profile. */
export function nativeAccountBetaEnabled(value: string | undefined): boolean {
  return value === "true";
}

export const NATIVE_ACCOUNT_BETA_ENABLED = nativeAccountBetaEnabled(
  process.env.NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED,
);

/** Enables only the reviewed production account-US profile. */
export function nativeAccountUsReleaseEnabled(value: string | undefined): boolean {
  return value === "true";
}

export const NATIVE_ACCOUNT_US_RELEASE_ENABLED = nativeAccountUsReleaseEnabled(
  process.env.NEXT_PUBLIC_NATIVE_ACCOUNT_US_RELEASE_ENABLED,
);

/** Fails closed when no native account profile, or two profiles, are selected. */
export function nativeAccountEnabled(
  betaEnabled: boolean,
  accountUsEnabled: boolean,
): boolean {
  return betaEnabled !== accountUsEnabled;
}

export const NATIVE_ACCOUNT_ENABLED = nativeAccountEnabled(
  NATIVE_ACCOUNT_BETA_ENABLED,
  NATIVE_ACCOUNT_US_RELEASE_ENABLED,
);

/** Truthful copy shared by every disabled account-sync entry point. */
export const ACCOUNT_SYNC_CONTAINMENT_NOTICE =
  "Account sync is temporarily unavailable. Your journey is staying on this device.";

/** Allows one explicit latch change to restore sync after the exit gates pass. */
export function accountSyncAvailable(
  supabaseConfigured: boolean,
  contained = ACCOUNT_SYNC_CONTAINED,
  nativeTarget = isNativeTarget(),
  nativeAccountEnabled = NATIVE_ACCOUNT_ENABLED,
): boolean {
  return (
    supabaseConfigured &&
    !contained &&
    (!nativeTarget || nativeAccountEnabled)
  );
}
