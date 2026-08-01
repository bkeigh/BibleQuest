import { BOOSTS, type BoostId } from "./boosts";

/**
 * What the arcade is allowed to sell.
 *
 * Two kinds, and no third. **Packs** add days to play — more Scripture, more
 * boards. **Bundles** add board helps a reader could also earn by playing. What
 * is not here is the line the rest of the app already draws: nothing sells a
 * level skip, an answer, an explanation, or a passage. Reading is the product;
 * it is not the thing being withheld.
 *
 * `assertNoShortcutsForSale` and the boundary test keep that honest as the
 * catalogue grows.
 */
export type ArcadeProductKind = "pack" | "bundle";

export interface ArcadeProduct {
  readonly id: string;
  readonly kind: ArcadeProductKind;
  readonly title: string;
  readonly description: string;
  /** Display only — the charge itself is the store's job, not this list's. */
  readonly price: string;
  /** For a bundle: what lands in the reader's inventory. */
  readonly grants?: readonly { id: BoostId; count: number }[];
  /** For a pack: how much play it adds, in the reader's terms. */
  readonly adds?: string;
}

export const ARCADE_PRODUCTS: readonly ArcadeProduct[] = [
  {
    id: "pack-exodus",
    kind: "pack",
    title: "Out of Egypt",
    description:
      "Seven more days of boards and questions, walking Exodus from the bush to the sea.",
    price: "$2.99",
    adds: "7 days · 49 levels",
  },
  {
    id: "pack-psalms",
    kind: "pack",
    title: "Songs for the Road",
    description:
      "Seven days in the Psalms, with the questions drawn from the songs themselves.",
    price: "$2.99",
    adds: "7 days · 49 levels",
  },
  {
    id: "bundle-helps-small",
    kind: "bundle",
    title: "A few helps",
    description: `Three of each: ${BOOSTS["extra-moves"].name.toLowerCase()}, ${BOOSTS.hint.name.toLowerCase()}, and ${BOOSTS.gather.name.toLowerCase()}.`,
    price: "$0.99",
    grants: [
      { id: "extra-moves", count: 3 },
      { id: "hint", count: 3 },
      { id: "gather", count: 3 },
    ],
  },
  {
    id: "bundle-helps-large",
    kind: "bundle",
    title: "A full satchel",
    description: "Ten of each help, for a long stretch of harder days.",
    price: "$3.99",
    grants: [
      { id: "extra-moves", count: 10 },
      { id: "hint", count: 10 },
      { id: "gather", count: 10 },
    ],
  },
];

/**
 * Whether the store can actually take money yet.
 *
 * One-time purchases need their own products and webhooks behind the existing
 * subscription checkout, which is a server change rather than a screen. Until
 * that lands the shelf is shown but nothing is sold, because listing a price
 * on a button that cannot charge is a lie a reader would find by tapping it.
 */
export const ARCADE_STORE_CHECKOUT_READY =
  process.env.NEXT_PUBLIC_ARCADE_STORE_ENABLED === "true";

/**
 * What still has to exist before that latch may be flipped.
 *
 * The latch only changes a label and a `disabled` attribute. On its own it
 * turns "Not on sale yet" into a live-looking **Buy** button with nothing
 * behind it — a worse lie than the one it replaces, and a silent one, because
 * a button that does nothing looks exactly like a button that is slow.
 *
 * Each product needs a Stripe price, a one-time checkout session (the pattern
 * is already in `app/api/support/checkout`, which runs `mode: "payment"`), and
 * webhook fulfilment that grants the boosts or unlocks the pack — bundles pay
 * out through `grantBoost`, packs need their days registered. Until a checkout
 * handler is wired, `tests/seven-days-match.test.ts` fails the build if this
 * latch is turned on, so the dead button cannot ship quietly.
 */
export const ARCADE_STORE_CHECKOUT_PREREQUISITES = [
  "stripe-price-per-product",
  "one-time-checkout-session",
  "webhook-fulfilment",
] as const;

/** Words that would mean the arcade had started selling its way past reading. */
const FORBIDDEN_IN_A_PRODUCT = [
  "skip",
  "unlock the answer",
  "reveal the answer",
  "answer key",
  "explanation",
  "solve",
];

/**
 * Fails the build if a product ever offers a way past the Scripture rather than
 * more of it. Cheap to run, and it is the one rule most likely to erode quietly
 * when a catalogue grows.
 */
export function assertNoShortcutsForSale(
  products: readonly ArcadeProduct[] = ARCADE_PRODUCTS,
): void {
  for (const product of products) {
    const text = `${product.title} ${product.description} ${product.adds ?? ""}`
      .toLocaleLowerCase();
    for (const word of FORBIDDEN_IN_A_PRODUCT) {
      if (text.includes(word)) {
        throw new Error(
          `Arcade product "${product.id}" offers "${word}". The arcade sells more Scripture, never a way past it.`,
        );
      }
    }
  }
}

assertNoShortcutsForSale();
