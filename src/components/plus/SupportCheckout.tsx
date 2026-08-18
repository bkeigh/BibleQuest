"use client";

import { useRef, useState } from "react";
import { track } from "@/lib/analytics/events";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/brand";
import { GentleButton } from "@/components/design-system/GentleButton";
import {
  formatSupportAmount,
  parseCustomSupportAmount,
  SUPPORT_MAXIMUM_AMOUNT,
  SUPPORT_MINIMUM_AMOUNT,
  SUPPORT_PRESET_AMOUNTS,
} from "@/lib/support/config";
import { apiFetch } from "@/lib/platform/api";
import { webCommerceAvailable } from "@/lib/platform/purchases";

interface SupportCheckoutProps {
  enabled: boolean;
  mode: "test" | "live" | null;
  returnNotice: "returned" | "cancelled" | null;
}

/** Offers bounded one-time amounts and redirects only to hosted Stripe. */
export function SupportCheckout({
  enabled,
  mode,
  returnNotice,
}: SupportCheckoutProps) {
  const [selected, setSelected] = useState<number | "custom">(1_000);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ id: string; amount: number } | null>(null);
  const commerceAvailable = webCommerceAvailable();
  const amount =
    selected === "custom" ? parseCustomSupportAmount(custom) : selected;

  const submit = async () => {
    if (!enabled || !commerceAvailable || amount === null) return;
    setBusy(true);
    setError(null);
    // Preserve idempotency for a retry, but use a fresh identity after an
    // amount change so the server's immutable amount binding still works.
    if (request.current?.amount !== amount) {
      request.current = { id: crypto.randomUUID(), amount };
    }
    try {
      const response = await apiFetch("/api/support/checkout", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          requestId: request.current.id,
        }),
      });
      if (!response.ok) throw new Error("checkout unavailable");
      const payload = (await response.json()) as { url?: unknown };
      if (typeof payload.url !== "string") {
        throw new Error("checkout unavailable");
      }
      const destination = new URL(payload.url);
      if (
        destination.origin !== "https://checkout.stripe.com" ||
        destination.username ||
        destination.password
      ) {
        throw new Error("checkout unavailable");
      }
      track("support_checkout_opened");
      window.location.assign(destination.toString());
    } catch {
      setError(
        "Secure one-time checkout couldn’t be opened. No payment was confirmed.",
      );
      setBusy(false);
    }
  };

  if (!enabled || !commerceAvailable) {
    return (
      <div role="status">
        <h2 className="font-display text-[1.375rem] text-graphite">
          One-time support is temporarily unavailable
        </h2>
        <p className="mt-2 text-small leading-relaxed text-charcoal">
          Secure Checkout is closed for this deployment. No payment control is
          shown, and no information has been sent to Stripe.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-[1.375rem] text-graphite">
        Choose a one-time amount
      </h2>
      <p className="mt-2 text-small leading-relaxed text-charcoal">
        No account is required. Stripe handles payment details and asks where
        to send a receipt; BibleQuest does not collect full card numbers.
      </p>
      {returnNotice === "cancelled" && (
        <p className="mt-3 text-small text-ash">
          Checkout was canceled. No payment is inferred from this return.
        </p>
      )}
      {returnNotice === "returned" && (
        <p className="mt-3 text-small text-ash">
          Thanks for returning. Only Stripe’s signed webhook confirms payment;
          Stripe sends the receipt when provider receipt emails are enabled.
        </p>
      )}
      {mode === "test" && (
        <p className="mt-3 text-caption font-medium text-gilt">
          Stripe test mode — no real payment is accepted.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SUPPORT_PRESET_AMOUNTS.map((preset) => (
          <GentleButton
            key={preset}
            type="button"
            size="sm"
            variant={selected === preset ? "gold" : "outline"}
            aria-pressed={selected === preset}
            onClick={() => {
              setSelected(preset);
              setError(null);
            }}
            disabled={busy}
          >
            {formatSupportAmount(preset)}
          </GentleButton>
        ))}
      </div>

      <div className="mt-3">
        <label
          htmlFor="custom-support-amount"
          className="text-caption font-medium text-charcoal"
        >
          Or enter a custom amount
        </label>
        <div className="mt-1 flex items-center gap-2">
          <span aria-hidden="true" className="text-charcoal">
            $
          </span>
          <input
            id="custom-support-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="3.00–500.00"
            value={custom}
            onFocus={() => setSelected("custom")}
            onChange={(event) => {
              setSelected("custom");
              setCustom(event.target.value);
              setError(null);
            }}
            disabled={busy}
            aria-describedby="support-amount-help"
            className="min-h-11 w-full rounded-[var(--radius-button)] border border-rule bg-paper px-3 py-2 text-charcoal outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20"
          />
        </div>
        <p id="support-amount-help" className="mt-1 text-caption text-ash">
          Minimum {formatSupportAmount(SUPPORT_MINIMUM_AMOUNT)}; maximum{" "}
          {formatSupportAmount(SUPPORT_MAXIMUM_AMOUNT)}.
        </p>
      </div>

      <GentleButton
        type="button"
        variant="gold"
        size="lg"
        className="mt-5"
        disabled={busy || amount === null}
        onClick={() => void submit()}
      >
        Continue to secure one-time Checkout{busy ? " …" : ""}
      </GentleButton>
      <p className="mt-3 text-caption leading-relaxed text-ash">
        This is voluntary, non-recurring, and not tax-deductible. It creates no
        Plus membership or spiritual benefit. For receipt or refund help,
        contact{" "}
        <a href={SUPPORT_EMAIL_HREF} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
        ; legally required refund rights still apply.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-small text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
