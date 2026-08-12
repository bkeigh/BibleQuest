export interface NativeStorefrontSnapshot {
  countryCode?: unknown;
  checkedAtEpochMilliseconds?: unknown;
}

export type StripeExternalPurpose = "checkout" | "billing";

export interface NativeAppToWebBridge {
  currentStorefront: () => Promise<unknown>;
  openExternalStripeUrl: (options: {
    purpose: StripeExternalPurpose;
    requestId: string;
    url: string;
  }) => Promise<unknown>;
  cancelExternalStripeOpen: (options: {
    requestId: string;
  }) => Promise<unknown>;
  observeStorefrontChanges: (
    listener: () => void,
  ) => Promise<() => void>;
}

interface BibleQuestCommercePlugin {
  getCurrentStorefront: () => Promise<unknown>;
  openExternalStripeUrl: (options: {
    purpose: StripeExternalPurpose;
    requestId: string;
    url: string;
  }) => Promise<unknown>;
  cancelExternalStripeOpen: (options: {
    requestId: string;
  }) => Promise<unknown>;
  addListener: (
    eventName: "storefrontChanged" | "checkoutReturn",
    listener: (event: { url?: unknown }) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
}

let pluginPromise: Promise<BibleQuestCommercePlugin> | null = null;

/** Loads the app-local iOS bridge only after the closed native adapter opts in. */
async function commercePlugin(): Promise<BibleQuestCommercePlugin> {
  if (!pluginPromise) {
    pluginPromise = import("@capacitor/core").then(
      ({ Capacitor, registerPlugin }) => {
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
          throw new Error("Native commerce is unavailable.");
        }
        return registerPlugin<BibleQuestCommercePlugin>(
          "BibleQuestCommerce",
        );
      },
    );
  }
  return pluginPromise;
}

/** Keeps StoreKit and external-browser calls behind one dependency-free bridge. */
export const nativeAppToWebBridge: NativeAppToWebBridge = {
  currentStorefront: async () =>
    (await commercePlugin()).getCurrentStorefront(),
  openExternalStripeUrl: async (options) =>
    (await commercePlugin()).openExternalStripeUrl(options),
  cancelExternalStripeOpen: async (options) =>
    (await commercePlugin()).cancelExternalStripeOpen(options),
  observeStorefrontChanges: async (listener) => {
    const handle = await (await commercePlugin()).addListener(
      "storefrontChanged",
      listener,
    );
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      void handle.remove().catch(() => undefined);
    };
  },
};

/** Delivers only native URLs that still pass the shared exact return parser. */
export async function observeNativeCheckoutReturns(
  listener: (url: string) => void,
): Promise<() => void> {
  const handle = await (await commercePlugin()).addListener(
    "checkoutReturn",
    (event) => {
      if (typeof event.url === "string") listener(event.url);
    },
  );
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    void handle.remove().catch(() => undefined);
  };
}
