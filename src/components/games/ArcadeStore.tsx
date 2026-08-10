"use client";

import { useEffect, useState } from "react";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import {
  GentleButton,
  GentleLink,
} from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { ARCADE_PRODUCTS } from "@/lib/games/arcade/store";
import { useArcadeAccess } from "@/lib/games/arcade/useArcadeAccess";
import { isNativeTarget } from "@/lib/platform/target";

type ReturnNotice = "returned" | "cancelled" | null;

/** Reads only bounded Checkout copy; ownership still comes from the server. */
function checkoutReturnNotice(): ReturnNotice {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("checkout");
  return value === "returned" || value === "cancelled" ? value : null;
}

/** The purchasable, server-authoritative Seven Days Match shelf. */
function ArcadeStoreInner() {
  const access = useArcadeAccess();
  const refresh = access.refresh;
  const [notice] = useState<ReturnNotice>(checkoutReturnNotice);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Stripe normally delivers the webhook before redirecting, while these
  // retries cover the small window where the account projection arrives later.
  useEffect(() => {
    if (notice !== "returned") return;
    const first = window.setTimeout(() => void refresh(), 1_000);
    const second = window.setTimeout(() => void refresh(), 3_000);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [notice, refresh]);

  return (
    <div className="space-y-6">
      {notice === "returned" && (
        <PaperCard as="section" role="status" variant="atmospheric" padding="lg">
          <p className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
            Thank you for your purchase
          </p>
          <h2 className="mt-2 font-display text-[1.5rem] text-graphite">
            Your arcade item is being added
          </h2>
          <p className="mt-2 text-body leading-relaxed text-charcoal">
            Stripe is confirming the payment. Your item will appear here and
            inside Seven Days Match as soon as that confirmation arrives.
          </p>
        </PaperCard>
      )}

      {notice === "cancelled" && (
        <p role="status" className="text-small text-ash">
          Checkout was cancelled. Nothing was charged.
        </p>
      )}

      <PaperCard variant="paper" padding="lg">
        <p className="font-art-label text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
          Seven Days Match
        </p>
        <h2 className="mt-2 font-display text-[1.5rem] leading-tight text-graphite">
          Choose how you want to play
        </h2>
        <p className="mt-2 text-body leading-relaxed text-charcoal">
          Questions remain available with either purchase. A Question Skip
          opens one next chapter; the Game Pass permanently removes every
          question gate from this game.
        </p>
      </PaperCard>

      <section aria-labelledby="arcade-products-title">
        <h2
          id="arcade-products-title"
          className="font-art-label text-[1.125rem] uppercase tracking-[0.06em] text-accent"
        >
          Game items
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {ARCADE_PRODUCTS.map((product) => {
            const owned =
              product.id === "game-pass" && access.gamePass;
            const held =
              product.id === "question-skip" ? access.questionSkips : 0;
            const busy = purchasing === product.id;
            const disabled =
              access.loading ||
              !access.signedIn ||
              !access.available ||
              owned ||
              purchasing !== null;
            return (
              <PaperCard as="li" key={product.id} variant="paper" padding="md">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-subheading text-graphite">
                    {product.title}
                  </h3>
                  <span className="shrink-0 text-small font-medium text-gilt">
                    {product.price}
                  </span>
                </div>
                <p className="mt-2 text-small leading-relaxed text-charcoal">
                  {product.description}
                </p>
                {(owned || held > 0) && (
                  <p className="mt-2 text-caption font-medium text-accent">
                    {owned
                      ? "Owned — every chapter is unlocked"
                      : `${held} Question Skip${held === 1 ? "" : "s"} ready`}
                  </p>
                )}
                <GentleButton
                  variant="primary"
                  size="sm"
                  fullWidth
                  className="mt-4"
                  disabled={disabled}
                  onClick={async () => {
                    setPurchasing(product.id);
                    setCheckoutError(null);
                    const redirected = await access.startCheckout(product.id);
                    if (!redirected) {
                      setCheckoutError(
                        "Checkout couldn’t be opened. Please try again.",
                      );
                      setPurchasing(null);
                    }
                  }}
                >
                  {owned ? "Owned" : busy ? "Opening checkout…" : "Buy"}
                </GentleButton>
              </PaperCard>
            );
          })}
        </ul>
      </section>

      {!access.signedIn && !access.loading && (
        <PaperCard variant="quiet" padding="md">
          <p className="text-small leading-relaxed text-charcoal">
            Sign in before purchasing so your Game Pass and Question Skips stay
            attached to your account.
          </p>
          <GentleLink href="/app/account" variant="outline" size="sm" className="mt-3">
            Sign in or create an account
          </GentleLink>
        </PaperCard>
      )}

      {access.signedIn && !access.loading && !access.available && (
        <p className="text-small leading-relaxed text-ash">
          Arcade purchases are not available on this deployment yet.
        </p>
      )}

      {(checkoutError || access.error) && (
        <p role="alert" className="text-small text-rose-700">
          {checkoutError ?? access.error}
        </p>
      )}

      <PaperCard variant="atmospheric" padding="md">
        <p className="text-small font-medium text-graphite">
          Your purchase also gives back
        </p>
        <p className="mt-1 text-caption leading-relaxed text-charcoal">
          BibleQuest pledges 5% of arcade purchase revenue to nonprofit
          organizations and local communities. Thank you for helping the game
          reach beyond the screen.
        </p>
      </PaperCard>
    </div>
  );
}

export function ArcadeStore() {
  // The native export also prunes this route; this render guard keeps the
  // component safe if it is reused before a StoreKit implementation exists.
  if (isNativeTarget()) return null;

  return (
    <ClientOnly>
      <ArcadeStoreInner />
    </ClientOnly>
  );
}
