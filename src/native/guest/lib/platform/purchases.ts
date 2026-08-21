import type { PlatformRuntime } from "@/lib/platform/runtime";

export type PurchaseProduct = "monthly" | "annual" | "lifetime";
export type PurchaseAction =
  | "redirected"
  | "restored"
  | "deferred"
  | "unavailable"
  | "failed";

export interface PurchaseAdapter {
  channel: "web-stripe" | "native";
  available: boolean;
  purchase: (
    expectedUserId: string,
    product: PurchaseProduct,
  ) => Promise<PurchaseAction>;
  restore: (expectedUserId: string) => Promise<PurchaseAction>;
  manage: (expectedUserId: string) => Promise<PurchaseAction>;
}

export interface NativePurchaseAdapter extends PurchaseAdapter {
  channel: "native";
}

/** Preserves the canonical call shape while refusing injected web transports. */
interface PurchaseDependencies {
  runtime?: PlatformRuntime;
  native?: NativePurchaseAdapter;
  fetcher?: (
    expectedUserId: string,
    path: string,
    init?: RequestInit,
  ) => Promise<Response>;
  navigate?: (url: string) => void;
}

/** Supplies one immutable unavailable adapter for every guest caller. */
const GUEST_PURCHASE_ADAPTER: NativePurchaseAdapter = Object.freeze({
  channel: "native",
  available: false,
  purchase: async (): Promise<PurchaseAction> => "unavailable",
  restore: async (): Promise<PurchaseAction> => "unavailable",
  manage: async (): Promise<PurchaseAction> => "unavailable",
});

/** Keeps every web purchase entry point hidden in the guest app. */
export function webCommerceAvailable(_runtime?: PlatformRuntime): boolean {
  void _runtime;
  return false;
}

/** Ignores injected dependencies so guest builds cannot construct a web adapter. */
export function purchaseAdapter(
  _dependencies: PurchaseDependencies = {},
): PurchaseAdapter {
  void _dependencies;
  return GUEST_PURCHASE_ADAPTER;
}
