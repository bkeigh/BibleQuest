"use client";

import { useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { usePlus } from "@/lib/revenuecat/usePlus";

const REASSURANCE = "Cancel anytime — the free app stays complete either way.";

/** Purchase and membership controls for the dashboard-selected Plus paywall. */
export function PlusCta() {
  const {
    status,
    isPlus,
    canPurchase,
    managementURL,
    error,
    presentPaywall,
    openCustomerCenter,
    refresh,
  } = usePlus();
  const [busy, setBusy] = useState<"paywall" | "refresh" | null>(null);

  if (status === "coming-soon") {
    return (
      <p className="mt-5 text-[0.8125rem] text-ash">
        Plus is still being prepared. The exact price and trial terms will
        appear before you choose anything, and the free app stays complete
        either way.
      </p>
    );
  }

  if (status === "unconfigured") {
    return (
      <p className="mt-5 text-[0.8125rem] text-ash">
        Membership isn’t available right now. The free app stays complete while
        we finish setup.
      </p>
    );
  }

  if (status === "loading") {
    return (
      <p className="mt-5 text-[0.8125rem] text-ash">
        Loading membership options…
      </p>
    );
  }

  const retryRefresh = async () => {
    setBusy("refresh");
    try {
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (status === "error") {
    return (
      <div className="mt-5 space-y-2">
        <p className="text-[0.8125rem] text-rose-700">{error}</p>
        <GentleButton
          variant="text"
          size="sm"
          onClick={retryRefresh}
          disabled={busy !== null}
        >
          Try again{busy === "refresh" ? " …" : ""}
        </GentleButton>
      </div>
    );
  }

  if (isPlus && status === "management-unavailable") {
    return (
      <div className="mt-5 space-y-2">
        <p className="text-[0.8125rem] leading-relaxed text-charcoal">
          You’re a Plus member. Membership management is temporarily
          unavailable, but your access is still active.
        </p>
        <GentleButton
          variant="text"
          size="sm"
          onClick={retryRefresh}
          disabled={busy !== null}
        >
          Refresh membership{busy === "refresh" ? " …" : ""}
        </GentleButton>
      </div>
    );
  }

  if (isPlus) {
    return (
      <div className="mt-5 space-y-2">
        <p className="text-[0.8125rem] leading-relaxed text-charcoal">
          You’re a member — thank you for helping keep BibleQuest free and whole
          for everyone.
        </p>
        <GentleButton
          variant="text"
          size="sm"
          onClick={openCustomerCenter}
          disabled={!managementURL}
        >
          Manage your membership
        </GentleButton>
      </div>
    );
  }

  // A key or a package list is not enough. The current offering must have a
  // published paywall and at least one package before any purchase control is
  // rendered.
  if (!canPurchase) {
    return (
      <p className="mt-5 text-[0.8125rem] text-ash">
        Membership options aren’t ready yet — the free app stays complete either
        way.
      </p>
    );
  }

  const openPaywall = async () => {
    setBusy("paywall");
    try {
      await presentPaywall();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5 space-y-3">
      <GentleButton
        variant="gold"
        size="md"
        onClick={openPaywall}
        disabled={busy !== null}
        aria-busy={busy === "paywall"}
      >
        Support with BibleQuest Plus{busy === "paywall" ? " …" : ""}
      </GentleButton>
      {status === "purchase-cancelled" && (
        <p className="text-[0.8125rem] text-ash">
          No changes were made. You can come back whenever you’re ready.
        </p>
      )}
      {status === "purchase-failed" && error && (
        <p className="text-[0.8125rem] text-rose-700">{error}</p>
      )}
      <p className="text-[0.75rem] text-ash">{REASSURANCE}</p>
    </div>
  );
}
