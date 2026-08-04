/** The two server-allowlisted purchases offered by Seven Days Match. */
export const ARCADE_PRODUCT_IDS = ["question-skip", "game-pass"] as const;
export type ArcadeProductId = (typeof ARCADE_PRODUCT_IDS)[number];
export type ArcadeProductKind = "consumable" | "entitlement";

export interface ArcadeProduct {
  readonly id: ArcadeProductId;
  readonly kind: ArcadeProductKind;
  readonly title: string;
  readonly description: string;
  readonly price: string;
  /** Checked again against Stripe before Checkout and fulfilment. */
  readonly unitAmount: number;
}

export const ARCADE_PRODUCTS: readonly ArcadeProduct[] = [
  {
    id: "question-skip",
    kind: "consumable",
    title: "Question Skip",
    description:
      "Skip one completed day’s question round and open the next chapter.",
    price: "$0.99",
    unitAmount: 99,
  },
  {
    id: "game-pass",
    kind: "entitlement",
    title: "Seven Days Game Pass",
    description:
      "Permanently unlock every Seven Days Match chapter. Questions stay available whenever you want them, but no longer gate the game.",
    price: "$2.99",
    unitAmount: 299,
  },
];

/** Narrows untrusted route input to the fixed server catalogue. */
export function isArcadeProductId(value: unknown): value is ArcadeProductId {
  return (
    typeof value === "string" &&
    (ARCADE_PRODUCT_IDS as readonly string[]).includes(value)
  );
}

/** Returns one immutable product definition without accepting a client price. */
export function arcadeProduct(id: ArcadeProductId): ArcadeProduct {
  return ARCADE_PRODUCTS.find((product) => product.id === id)!;
}
