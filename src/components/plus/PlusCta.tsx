"use client";

// Note: purchases-js@1.47 injects its own paywall/checkout styles at runtime —
// there is no separate stylesheet to import (the "./styles" export is stale).
import { useState } from "react";
import type { Package } from "@revenuecat/purchases-js";
import { GentleButton } from "@/components/design-system/GentleButton";
import { usePlus } from "@/lib/revenuecat/usePlus";

const REASSURANCE = "Cancel anytime — the free app stays complete either way.";

/**
 * The footer of the Plus card. Until RevenueCat is configured this renders the
 * exact "coming soon" copy the app ships with today. Once the public key is set
 * it prefers the RevenueCat-designed paywall (presentPaywall) when one is
 * published, and otherwise falls back to direct package purchase — so it works
 * on the Test Store immediately and upgrades to the paywall with no code change.
 * See docs/REVENUECAT.md.
 */
export function PlusCta() {
  const {
    configured,
    loading,
    isPlus,
    hasPaywall,
    packages,
    managementURL,
    error,
    presentPaywall,
    purchase,
    openCustomerCenter,
  } = usePlus();
  const [busy, setBusy] = useState<string | null>(null);

  // Not wired yet → today's behavior, unchanged.
  if (!configured) {
    return (
      <p className="mt-5 text-[0.8125rem] text-ash">
        Plus isn’t out yet. We’re planning $8.99 a month — about 29¢ a day — no
        pressure, no countdown timers, and the free app stays complete either
        way.
      </p>
    );
  }

  if (loading) {
    return <p className="mt-5 text-[0.8125rem] text-ash">Loading membership options…</p>;
  }

  // Member → thank-you + the web Customer Center (RevenueCat management page).
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

  const openPaywall = async () => {
    setBusy("paywall");
    try {
      await presentPaywall();
    } finally {
      setBusy(null);
    }
  };

  const buy = async (pkg: Package) => {
    setBusy(pkg.identifier);
    try {
      await purchase(pkg);
    } catch {
      // Surfaced via `error`; nothing more to do here.
    } finally {
      setBusy(null);
    }
  };

  // Preferred: the RevenueCat-designed paywall (one button, RC runs checkout).
  if (hasPaywall) {
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
        {error && <p className="text-[0.8125rem] text-rose-700">{error}</p>}
        <p className="text-[0.75rem] text-ash">{REASSURANCE}</p>
      </div>
    );
  }

  // Fallback (no paywall published yet): buy a package directly. Fully working
  // on the Test Store; the empty case stays calm rather than dumping a wall.
  if (packages.length === 0) {
    return (
      <p className="mt-5 text-[0.8125rem] text-ash">
        {error ??
          "Membership options aren’t available right now — the free app stays complete either way."}
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {packages.map((pkg) => {
          const price =
            pkg.webBillingProduct.price?.formattedPrice ??
            pkg.webBillingProduct.currentPrice.formattedPrice;
          return (
            <GentleButton
              key={pkg.identifier}
              variant="gold"
              size="sm"
              onClick={() => buy(pkg)}
              disabled={busy !== null}
              aria-busy={busy === pkg.identifier}
            >
              {pkg.webBillingProduct.title} · {price}
              {busy === pkg.identifier ? " …" : ""}
            </GentleButton>
          );
        })}
      </div>
      {error && <p className="text-[0.8125rem] text-rose-700">{error}</p>}
      <p className="text-[0.75rem] text-ash">{REASSURANCE}</p>
    </div>
  );
}
