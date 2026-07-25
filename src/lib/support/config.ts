export const STRIPE_SUPPORT_CONTRACT =
  "biblequest_stripe_one_time_support_v1";
export const SUPPORT_CURRENCY = "usd";
export const SUPPORT_MINIMUM_AMOUNT = 300;
export const SUPPORT_MAXIMUM_AMOUNT = 50_000;
export const SUPPORT_PRESET_AMOUNTS = [500, 1_000, 2_500, 5_000] as const;
export const MAX_SUPPORT_REQUEST_BYTES = 8 * 1024;

/** Accepts only integer USD minor units inside the reviewed support range. */
export function isSupportAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= SUPPORT_MINIMUM_AMOUNT &&
    value <= SUPPORT_MAXIMUM_AMOUNT
  );
}

/** Parses a custom dollar string without floating-point amount arithmetic. */
export function parseCustomSupportAmount(value: string): number | null {
  const match = value.match(/^(0|[1-9][0-9]{0,2})(?:[.]([0-9]{1,2}))?$/);
  if (!match) return null;
  const amount =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return isSupportAmount(amount) ? amount : null;
}

/** Formats a trusted minor-unit support amount for the current locale. */
export function formatSupportAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: SUPPORT_CURRENCY.toUpperCase(),
  }).format(amount / 100);
}
