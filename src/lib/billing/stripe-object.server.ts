import "server-only";

/** Unwraps Stripe's expandable object references without duplicating casts. */
export function stripeObjectId(
  value: string | { id: string } | null,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
