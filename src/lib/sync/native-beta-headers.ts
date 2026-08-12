/** Public request markers for the isolated native account-beta cohort. */
export const NATIVE_ACCOUNT_BETA_CONTRACT =
  "biblequest_native_account_beta_v1";
export const NATIVE_ACCOUNT_BETA_HEADER =
  "x-biblequest-native-account-beta";
export const NATIVE_ACCOUNT_BETA_HEADER_VALUE = "v1";
export const NATIVE_ACCOUNT_US_RELEASE_CONTRACT =
  "biblequest_native_account_us_release_v1";
export const NATIVE_ACCOUNT_US_RELEASE_HEADER =
  "x-biblequest-native-account-us-release";
export const NATIVE_ACCOUNT_US_RELEASE_HEADER_VALUE = "v1";
export const EXPECTED_ACCOUNT_USER_HEADER = "x-biblequest-expected-user";

export const NATIVE_ACCOUNT_REQUEST_HEADERS = [
  NATIVE_ACCOUNT_BETA_HEADER,
  NATIVE_ACCOUNT_US_RELEASE_HEADER,
] as const;

export interface NativeAccountRequestContract {
  contract: string;
  header: (typeof NATIVE_ACCOUNT_REQUEST_HEADERS)[number];
  value: "v1";
}

/** Selects exactly one build-time native account profile. */
export function nativeAccountBuildContract(
  beta = process.env.NEXT_PUBLIC_NATIVE_ACCOUNT_BETA_ENABLED,
  accountUs = process.env.NEXT_PUBLIC_NATIVE_ACCOUNT_US_RELEASE_ENABLED,
): NativeAccountRequestContract | null {
  if ((beta === "true") === (accountUs === "true")) return null;
  return beta === "true"
    ? {
        contract: NATIVE_ACCOUNT_BETA_CONTRACT,
        header: NATIVE_ACCOUNT_BETA_HEADER,
        value: NATIVE_ACCOUNT_BETA_HEADER_VALUE,
      }
    : {
        contract: NATIVE_ACCOUNT_US_RELEASE_CONTRACT,
        header: NATIVE_ACCOUNT_US_RELEASE_HEADER,
        value: NATIVE_ACCOUNT_US_RELEASE_HEADER_VALUE,
      };
}

/** Accepts one exact request contract and rejects missing, mixed, or malformed markers. */
export function nativeAccountRequestContract(
  headers: Pick<Headers, "get">,
): NativeAccountRequestContract | null {
  const beta = headers.get(NATIVE_ACCOUNT_BETA_HEADER);
  const accountUs = headers.get(NATIVE_ACCOUNT_US_RELEASE_HEADER);
  if ((beta === null) === (accountUs === null)) return null;
  if (beta !== null) {
    return beta === NATIVE_ACCOUNT_BETA_HEADER_VALUE
      ? nativeAccountBuildContract("true", "false")
      : null;
  }
  return accountUs === NATIVE_ACCOUNT_US_RELEASE_HEADER_VALUE
    ? nativeAccountBuildContract("false", "true")
    : null;
}

/** Narrows the disabled-beta exception to owned avatar deletion cleanup. */
export const ACCOUNT_DELETION_CLEANUP_HEADER =
  "x-biblequest-account-deletion-cleanup";
export const ACCOUNT_DELETION_CLEANUP_HEADER_VALUE = "v1";
