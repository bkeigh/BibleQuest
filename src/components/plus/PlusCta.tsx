"use client";

import Link from "next/link";
import { useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/brand";
import {
  formatBillingAmount,
  type BillingInterval,
} from "@/lib/billing/validation";
import { usePlus } from "@/lib/billing/usePlus";
import { buildPublicHref } from "@/lib/platform/api";
import { isNativeTarget } from "@/lib/platform/target";

function formattedDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

/** Shows Plus access from the server entitlement union and Stripe controls. */
export function PlusCta() {
  const plus = usePlus();
  const [busy, setBusy] = useState<
    BillingInterval | "portal" | "refresh" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const periodEnd = formattedDate(plus.currentPeriodEnd);
  const native = isNativeTarget();
  const portalReturnNotice =
    plus.returnNotice === "portal-returned" ? (
      <p className="text-[0.8125rem] leading-relaxed text-ash">
        Welcome back. Billing changes take effect only after BibleQuest
        reconciles them with Stripe; returning from the browser does not change
        access by itself.
      </p>
    ) : null;

  // Native Portal controls always explain that Stripe opens outside the app.
  const portalButtonCopy = native
    ? "Open Stripe in your browser to manage billing"
    : "Manage renewal, payment method, or invoices";
  const endedMembershipNotice =
    plus.status === "canceled" ? (
      <p className="text-[0.8125rem] leading-relaxed text-charcoal">
        Stripe confirms the prior membership has ended, so Plus is not active.
        Your local Scripture, prayers, reflections, and journey remain intact.
      </p>
    ) : plus.status === "incomplete_expired" ? (
      <p className="text-[0.8125rem] leading-relaxed text-charcoal">
        The earlier signup did not complete, and no Plus access was granted.
      </p>
    ) : null;

  const refresh = async () => {
    setBusy("refresh");
    setActionError(null);
    try {
      await plus.refresh();
    } catch {
      setActionError("Membership status couldn’t be refreshed just now.");
    } finally {
      setBusy(null);
    }
  };

  const portal = async () => {
    setBusy("portal");
    setActionError(null);
    try {
      if (!(await plus.openCustomerPortal())) {
        setActionError("Membership management is unavailable just now.");
      }
    } catch {
      setActionError("Membership management is unavailable just now.");
    } finally {
      setBusy(null);
    }
  };

  const checkout = async (interval: BillingInterval) => {
    setBusy(interval);
    setActionError(null);
    try {
      if (!(await plus.startCheckout(interval))) {
        setActionError(
          "Secure checkout couldn’t be opened. No charge was confirmed.",
        );
      }
    } catch {
      setActionError(
        "Secure checkout couldn’t be opened. No charge was confirmed.",
      );
    } finally {
      setBusy(null);
    }
  };

  if (plus.status === "coming-soon") {
    return (
      <p className="mt-5 text-[0.8125rem] text-ash">
        Plus is still being prepared. Production checkout is off, and the core
        app stays complete either way.
      </p>
    );
  }
  if (plus.status === "sign-in-required") {
    return (
      <p className="mt-5 text-[0.8125rem] leading-relaxed text-ash">
        <Link href="/app/account" className="text-accent underline">
          Sign in
        </Link>{" "}
        to view Plus plans or restore a membership. No account is created by a
        billing redirect.
      </p>
    );
  }
  if (plus.loading) {
    return (
      <p className="mt-5 text-[0.8125rem] text-ash">
        Loading membership status…
      </p>
    );
  }
  if (plus.status === "error") {
    return (
      <div className="mt-5 space-y-2">
        {portalReturnNotice}
        <p className="text-[0.8125rem] text-rose-700">{plus.error}</p>
        <GentleButton
          variant="text"
          size="sm"
          onClick={() => void refresh()}
          disabled={busy !== null}
        >
          Try again{busy === "refresh" ? " …" : ""}
        </GentleButton>
      </div>
    );
  }

  if (plus.isPlus) {
    const membershipDescription =
      plus.entitlementSource === "operator"
        ? periodEnd
          ? `BibleQuest Plus is active through ${periodEnd}.`
          : "BibleQuest Plus is active with no scheduled end."
        : plus.interval === "lifetime"
          ? "Stripe confirms your lifetime access."
          : plus.cancelAtPeriodEnd && periodEnd
            ? `Access remains active through ${periodEnd}; renewal is canceled.`
            : periodEnd
              ? `Your current period runs through ${periodEnd}.`
              : "Stripe confirms your membership is active.";
    return (
      <div className="mt-5 space-y-3">
        {portalReturnNotice}
        <p className="text-[0.8125rem] leading-relaxed text-charcoal">
          You’re a Plus member. {membershipDescription}
        </p>
        {plus.mode === "test" && (
          <p className="text-[0.75rem] text-gilt">
            Stripe test mode — no real payment is accepted.
          </p>
        )}
        {plus.entitlementSource === "stripe" &&
          plus.interval !== "lifetime" &&
          plus.canManage && (
            <GentleButton
              variant="text"
              size="sm"
              onClick={() => void portal()}
              disabled={busy !== null}
            >
              {portalButtonCopy}{busy === "portal" ? " …" : ""}
            </GentleButton>
          )}
        {plus.entitlementSource === "stripe" &&
          plus.interval !== "lifetime" &&
          !plus.canManage && (
            <p className="text-[0.75rem] leading-relaxed text-ash">
              {plus.hasCustomer
                ? "Billing management is unavailable from this app storefront."
                : "No Stripe billing profile is linked to this account."} Your
              local Scripture, prayers, reflections, and journey are unchanged.
              Contact{" "}
              <a href={SUPPORT_EMAIL_HREF} className="text-accent underline">
                {SUPPORT_EMAIL}
              </a>{" "}
              if this looks wrong.
            </p>
          )}
        {actionError && (
          <p className="text-[0.8125rem] text-rose-700">{actionError}</p>
        )}
      </div>
    );
  }

  if (
    ["past_due", "unpaid", "incomplete", "paused"].includes(plus.status)
  ) {
    return (
      <div className="mt-5 space-y-3">
        {portalReturnNotice}
        <p className="text-[0.8125rem] leading-relaxed text-charcoal">
          Stripe says this membership needs attention. Plus access is not
          granted from a return link or stale browser state.
        </p>
        {plus.canManage ? (
          <GentleButton
            variant="text"
            size="sm"
            onClick={() => void portal()}
            disabled={busy !== null}
          >
            {native
              ? "Review billing in your browser"
              : "Review billing in Stripe"}
            {busy === "portal" ? " …" : ""}
          </GentleButton>
        ) : (
          <p className="text-[0.75rem] leading-relaxed text-ash">
            {plus.hasCustomer
              ? "Stripe billing management is unavailable from this app storefront."
              : "No Stripe billing profile is linked to this account."} Your
            local Scripture, prayers, reflections, and journey are unchanged.
            Contact{" "}
            <a href={SUPPORT_EMAIL_HREF} className="text-accent underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            for billing help.
          </p>
        )}
        <GentleButton
          variant="text"
          size="sm"
          onClick={() => void refresh()}
          disabled={busy !== null}
        >
          Restore or refresh status{busy === "refresh" ? " …" : ""}
        </GentleButton>
      </div>
    );
  }

  if (!plus.canPurchase || plus.purchaseOptions.length !== 3) {
    // A non-US or unknown native storefront receives no acquisition surface.
    if (plus.purchaseChannel === "native") return null;
    return (
      <div className="mt-5 space-y-2">
        {portalReturnNotice}
        {endedMembershipNotice}
        <p className="text-[0.8125rem] text-ash">
          Membership purchase is unavailable. The core app stays complete while
          setup remains closed.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {portalReturnNotice}
      {plus.returnNotice === "checkout-cancelled" && (
        <p className="text-[0.8125rem] text-ash">
          Checkout was canceled. No membership change was inferred.
        </p>
      )}
      {plus.returnNotice === "checkout-returned" && (
        <p className="text-[0.8125rem] text-ash">
          Welcome back. Access appears only after the verified Stripe projection
          confirms it.
        </p>
      )}
      {plus.mode === "test" && (
        <p className="text-[0.75rem] font-medium text-gilt">
          Stripe test mode — these controls cannot make a real charge.
        </p>
      )}
      {endedMembershipNotice}
      {plus.purchaseChannel === "native" && (
        <p className="text-[0.8125rem] leading-relaxed text-charcoal">
          Choose a plan to leave BibleQuest and open secure Stripe Checkout in
          your system browser. Stripe shows the price and final total before
          you confirm. BibleQuest does not collect card details in the app.
        </p>
      )}
      {endedMembershipNotice}
      <div className="grid gap-2 sm:grid-cols-3">
        {plus.purchaseOptions.map((interval) => {
          const plan = plus.plans.find(
            (candidate) => candidate.interval === interval,
          );
          return (
            <GentleButton
              key={interval}
              variant="gold"
              size="md"
              disabled={busy !== null}
              onClick={() => void checkout(interval)}
            >
              {interval === "monthly"
                ? "Monthly"
                : interval === "annual"
                  ? "Annual"
                  : "Lifetime"}
              {plan
                ? ` — ${formatBillingAmount(plan)}${
                    interval === "monthly"
                      ? "/month"
                      : interval === "annual"
                        ? "/year"
                        : " once"
                  }`
                : " in Stripe"}
              {busy === interval ? " …" : ""}
            </GentleButton>
          );
        })}
      </div>
      <p className="text-[0.75rem] leading-relaxed text-ash">
        Monthly and annual Plus renew automatically until canceled. Lifetime
        Plus is one payment with no renewal. Cancel subscriptions in the Stripe
        portal; access continues through the paid period. Checkout shows the
        final total before confirmation. Refund requests are reviewed under the{" "}
        <Link href={buildPublicHref("/terms")} className="text-accent underline">
          Terms
        </Link>
        ; contact{" "}
        <a href={SUPPORT_EMAIL_HREF} className="text-accent underline">
          {SUPPORT_EMAIL}
        </a>
        . Core Scripture, prayer, reflection, and daily faith formation remain
        available.
      </p>
      {plus.canManage && (
        <GentleButton
          variant="text"
          size="sm"
          onClick={() => void portal()}
          disabled={busy !== null}
        >
          {native
            ? "Open existing billing in your browser"
            : "Open existing billing portal"}
          {busy === "portal" ? " …" : ""}
        </GentleButton>
      )}
      {actionError && (
        <p className="text-[0.8125rem] text-rose-700">{actionError}</p>
      )}
    </div>
  );
}
