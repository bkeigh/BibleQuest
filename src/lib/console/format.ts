/** Formats a nullable count without inventing zero for unavailable data. */
export function formatCount(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en-US").format(value);
}

/** Formats cents as a compact USD operator value. */
export function formatUsd(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Formats provider timestamps consistently while preserving missing states. */
export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Chooses a calm status tone from bounded operational labels. */
export function statusTone(
  status: string,
): "good" | "warning" | "danger" | "neutral" {
  if (
    [
      "ok",
      "active",
      "trialing",
      "processed",
      "completed",
      "enabled",
      "configured",
      "approved",
      "sent",
      "succeeded",
    ].includes(status)
  ) {
    return "good";
  }
  if (
    [
      "past_due",
      "processing",
      "partial",
      "coming-soon",
      "guest-only",
      "disabled",
      "pending",
      "partially_refunded",
      "denied",
    ].includes(status)
  ) {
    return "warning";
  }
  if (
    [
      "failed",
      "invalid",
      "unpaid",
      "disputed",
      "permanent_failure",
    ].includes(status)
  ) {
    return "danger";
  }
  return "neutral";
}
