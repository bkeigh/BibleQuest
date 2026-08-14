import { authenticatedApiFetch } from "./api";
import {
  platformRuntime,
  type PlatformRuntime,
} from "./runtime";

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

interface PurchaseDependencies {
  runtime?: PlatformRuntime;
  native?: NativePurchaseAdapter;
  fetcher?: typeof authenticatedApiFetch;
  navigate?: (url: string) => void;
}

/** Keeps every Stripe entry point out of a future App Store native bundle. */
export function webCommerceAvailable(
  runtime: PlatformRuntime = platformRuntime(),
): boolean {
  return runtime.target === "web";
}

/** Keeps Stripe on web and exposes a closed native purchase/restore/manage seam. */
export function purchaseAdapter(
  dependencies: PurchaseDependencies = {},
): PurchaseAdapter {
  const runtime = dependencies.runtime ?? platformRuntime();
  if (runtime.target === "native") {
    return dependencies.native ?? unavailableNativePurchaseAdapter();
  }
  return webStripePurchaseAdapter(dependencies);
}

/** Uses only server-created, exactly allowlisted Stripe redirects. */
function webStripePurchaseAdapter(
  dependencies: PurchaseDependencies,
): PurchaseAdapter {
  const fetcher = dependencies.fetcher ?? authenticatedApiFetch;
  const navigate =
    dependencies.navigate ??
    ((url: string) => {
      window.location.assign(url);
    });

  return {
    channel: "web-stripe",
    available: true,
    purchase: async (expectedUserId, product) => {
      try {
        const response = await fetcher(
          expectedUserId,
          "/api/billing/checkout",
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ interval: product }),
          },
        );
        const destination = response.ok
          ? await exactRedirect(response, "https://checkout.stripe.com")
          : null;
        if (!destination) return "failed";
        navigate(destination);
        return "redirected";
      } catch {
        return "failed";
      }
    },
    restore: async (expectedUserId) => {
      try {
        const response = await fetcher(
          expectedUserId,
          "/api/billing/refresh",
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
          },
        );
        if (response.ok) return "restored";
        return response.status === 429 ? "deferred" : "failed";
      } catch {
        return "failed";
      }
    },
    manage: async (expectedUserId) => {
      try {
        const response = await fetcher(
          expectedUserId,
          "/api/billing/portal",
          {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
          },
        );
        const destination = response.ok
          ? await exactRedirect(response, "https://billing.stripe.com")
          : null;
        if (!destination) return "failed";
        navigate(destination);
        return "redirected";
      } catch {
        return "failed";
      }
    },
  };
}

/** Rejects malformed, credentialed, or lookalike provider URLs. */
async function exactRedirect(
  response: Response,
  allowedOrigin: string,
): Promise<string | null> {
  const payload = (await response.json()) as { url?: unknown };
  if (typeof payload.url !== "string") return null;
  try {
    const destination = new URL(payload.url);
    if (
      destination.origin !== allowedOrigin ||
      destination.username ||
      destination.password
    ) {
      return null;
    }
    return destination.toString();
  } catch {
    return null;
  }
}

/** Makes native billing unavailable until an audited StoreKit adapter is supplied. */
function unavailableNativePurchaseAdapter(): NativePurchaseAdapter {
  return {
    channel: "native",
    available: false,
    purchase: async () => "unavailable",
    restore: async () => "unavailable",
    manage: async () => "unavailable",
  };
}
