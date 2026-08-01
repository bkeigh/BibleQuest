"use client";

import { useState } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import {
  BOOSTS,
  BOOST_IDS,
  readInventory,
} from "@/lib/games/arcade/boosts";
import {
  ARCADE_PRODUCTS,
  ARCADE_STORE_CHECKOUT_READY,
} from "@/lib/games/arcade/store";
import { cn } from "@/lib/utils/cn";

/**
 * The arcade shelf.
 *
 * It sells more Scripture — extra days to play — and board helps a reader can
 * also earn by answering well. It sells no way past a level, no answer, and no
 * explanation, and the catalogue is checked at build time to keep that true.
 *
 * Nothing charges yet. One-time purchases need their own products and webhooks
 * behind the existing subscription checkout, which is a server change rather
 * than a screen — so the shelf says so plainly instead of putting a price on a
 * button that would fail. What a reader *can* do today is earn the helps, and
 * that path is the one the page leads with.
 */
function ArcadeStoreInner() {
  const [inventory] = useState(readInventory);
  const packs = ARCADE_PRODUCTS.filter((product) => product.kind === "pack");
  const bundles = ARCADE_PRODUCTS.filter(
    (product) => product.kind === "bundle",
  );

  return (
    <div className="space-y-6">
      <PaperCard variant="atmospheric" padding="lg">
        <p className="font-pixel text-[0.875rem] uppercase tracking-[0.06em] text-gilt">
          What you are holding
        </p>
        <h2 className="mt-2 font-display text-[1.5rem] leading-tight text-graphite">
          Board helps
        </h2>
        <p className="mt-2 text-body leading-relaxed text-charcoal">
          Helps change the board and nothing else. Every level can be finished
          without them, and answering a day&apos;s questions well earns them —
          reading is how you get them, not the thing they get you past.
        </p>
        <ul className="mt-4 grid gap-2">
          {BOOST_IDS.map((id) => (
            <li
              key={id}
              className="flex items-center gap-3 rounded-[var(--radius-button)] border border-mist bg-linen/60 px-3 py-2.5"
            >
              <span aria-hidden="true" className="shrink-0">
                <PixelIcon name={BOOSTS[id].sprite} size={32} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-small font-medium text-graphite">
                  {BOOSTS[id].name}
                </span>
                <span className="block text-caption leading-relaxed text-ash">
                  {BOOSTS[id].description}
                </span>
              </span>
              <span className="shrink-0 text-small font-medium tabular-nums text-accent">
                {inventory[id]}
              </span>
            </li>
          ))}
        </ul>
      </PaperCard>

      <ShelfSection
        title="More days to play"
        blurb="Each pack is another seven days of boards and questions, drawn from a passage of its own."
        products={packs}
      />
      <ShelfSection
        title="Helps by the handful"
        blurb="The same helps you earn by answering well, if you would rather have more of them to hand."
        products={bundles}
      />

      <p className="text-caption leading-relaxed text-ash">
        The arcade never sells a level skip, an answer, or an explanation. Every
        question shows its reasoning and its passage the moment you answer it,
        right or wrong, and always will.
      </p>
    </div>
  );
}

function ShelfSection({
  title,
  blurb,
  products,
}: {
  title: string;
  blurb: string;
  products: readonly (typeof ARCADE_PRODUCTS)[number][];
}) {
  return (
    <section aria-label={title}>
      <h2 className="font-pixel text-[1.125rem] uppercase tracking-[0.06em] text-accent">
        {title}
      </h2>
      <p className="mt-1 text-small leading-relaxed text-ash">{blurb}</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {products.map((product) => (
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
            {product.adds && (
              <p className="mt-2 text-caption text-ash">{product.adds}</p>
            )}
            <GentleButton
              variant={ARCADE_STORE_CHECKOUT_READY ? "primary" : "outline"}
              size="sm"
              fullWidth
              className={cn("mt-4")}
              disabled={!ARCADE_STORE_CHECKOUT_READY}
            >
              {ARCADE_STORE_CHECKOUT_READY ? "Buy" : "Not on sale yet"}
            </GentleButton>
          </PaperCard>
        ))}
      </ul>
    </section>
  );
}

export function ArcadeStore() {
  return (
    <ClientOnly>
      <ArcadeStoreInner />
    </ClientOnly>
  );
}
