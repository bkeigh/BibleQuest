import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlusState } from "@/lib/billing/usePlus";

const mocks = vi.hoisted(() => ({
  usePlus: vi.fn(),
}));

vi.mock("@/lib/billing/usePlus", () => ({
  usePlus: mocks.usePlus,
}));

import { PlusCta } from "@/components/plus/PlusCta";
import { ExplorePlusLink } from "@/components/plus/ExplorePlusLink";

const PLATFORM = "NEXT_PUBLIC_APP_PLATFORM";
const HOSTED = "NEXT_PUBLIC_NATIVE_HOSTED_ORIGIN";

/** Supplies a free signed-in projection while the server stays authoritative. */
function plusState(overrides: Partial<PlusState> = {}): PlusState {
  return {
    configured: true,
    mode: "test",
    status: "free",
    loading: false,
    plan: "free",
    isPlus: false,
    entitlementSource: null,
    canPurchase: true,
    canManage: false,
    purchaseChannel: "native",
    purchaseOptions: ["monthly", "annual", "lifetime"],
    plans: [],
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    hasCustomer: false,
    synchronizedAt: null,
    error: null,
    returnNotice: null,
    startCheckout: vi.fn().mockResolvedValue(true),
    openCustomerPortal: vi.fn().mockResolvedValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  process.env[PLATFORM] = "native";
  process.env[HOSTED] = "https://www.biblequest.co";
});

afterEach(() => {
  delete process.env[PLATFORM];
  delete process.env[HOSTED];
  mocks.usePlus.mockReset();
});

describe("native Plus purchase presentation", () => {
  it("exposes the retained Plus route only after its native policy gate passes", () => {
    mocks.usePlus.mockReturnValue(plusState());
    expect(
      renderToStaticMarkup(createElement(ExplorePlusLink)),
    ).toContain("Explore Plus");

    mocks.usePlus.mockReturnValue(plusState({ canPurchase: false }));
    expect(renderToStaticMarkup(createElement(ExplorePlusLink))).toBe("");
  });

  it("shows plain external-checkout copy only after the US gate passes", () => {
    mocks.usePlus.mockReturnValue(plusState());
    const markup = renderToStaticMarkup(createElement(PlusCta));

    expect(markup).toContain("leave BibleQuest");
    expect(markup).toContain("secure Stripe Checkout");
    expect(markup).toContain("system browser");
    expect(markup).toContain("does not collect card details in the app");
    expect(markup).toContain("Monthly in Stripe");
    expect(markup).toContain("Annual in Stripe");
    expect(markup).toContain("Lifetime in Stripe");
    expect(markup).not.toMatch(/<iframe|<input|card number/i);
  });

  it("renders no acquisition UI for non-US, unknown, or stale storefront state", () => {
    mocks.usePlus.mockReturnValue(plusState({ canPurchase: false }));
    expect(renderToStaticMarkup(createElement(PlusCta))).toBe("");
  });

  it("never offers Checkout to a signed-out account", () => {
    mocks.usePlus.mockReturnValue(
      plusState({
        status: "sign-in-required",
        canPurchase: false,
        purchaseOptions: [],
      }),
    );
    const markup = renderToStaticMarkup(createElement(PlusCta));

    expect(markup).toContain("Sign in");
    expect(markup).not.toContain("secure Stripe Checkout");
    expect(markup).not.toContain("Monthly in Stripe");
  });

  it("keeps native portal acquisition absent until its reviewed gate passes", () => {
    mocks.usePlus.mockReturnValue(
      plusState({
        status: "plus",
        plan: "plus",
        isPlus: true,
        entitlementSource: "stripe",
        interval: "annual",
        hasCustomer: true,
        canPurchase: false,
        canManage: false,
      }),
    );
    expect(renderToStaticMarkup(createElement(PlusCta))).not.toContain(
      "Open Stripe in your browser to manage billing",
    );

    mocks.usePlus.mockReturnValue(
      plusState({
        status: "plus",
        plan: "plus",
        isPlus: true,
        entitlementSource: "stripe",
        interval: "annual",
        hasCustomer: true,
        canPurchase: false,
        canManage: true,
      }),
    );
    expect(renderToStaticMarkup(createElement(PlusCta))).toContain(
      "Open Stripe in your browser to manage billing",
    );
  });
});
