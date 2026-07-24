import type { BillingInterval } from "./validation";

export type StripeBillingMode = "coming-soon" | "test" | "live";
export type BillingEnvironment = Record<string, string | undefined>;

export interface StripeBillingConfiguration {
  status: "configured";
  mode: "test" | "live";
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  priceIds: Record<BillingInterval, string>;
  appOrigin: string;
  livemode: boolean;
  purchasesEnabled: boolean;
  supportEnabled: boolean;
}

export type StripeBillingAvailability =
  | { status: "coming-soon"; mode: "coming-soon" }
  | { status: "invalid"; mode: StripeBillingMode | "invalid" }
  | StripeBillingConfiguration;

const STRIPE_SECRET = /^sk_(test|live)_[A-Za-z0-9_]{16,}$/;
const STRIPE_PUBLISHABLE = /^pk_(test|live)_[A-Za-z0-9_]{16,}$/;
const STRIPE_PRICE = /^price_[A-Za-z0-9]+$/;
const STRIPE_WEBHOOK = /^whsec_[A-Za-z0-9_+/=-]{16,}$/;

function applicationOrigin(
  value: string | undefined,
  mode: "test" | "live",
): string | null {
  if (!value || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    const localTest =
      mode === "test" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localTest) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Parses the full deny-by-default Stripe gate from a supplied environment. */
export function stripeBillingAvailability(
  env: BillingEnvironment,
): StripeBillingAvailability {
  const rawMode = env.STRIPE_BILLING_MODE?.trim() || "coming-soon";
  if (rawMode === "coming-soon") {
    return { status: "coming-soon", mode: "coming-soon" };
  }
  if (rawMode !== "test" && rawMode !== "live") {
    return { status: "invalid", mode: "invalid" };
  }
  if (
    rawMode === "live" &&
    env.STRIPE_LIVE_BILLING_APPROVED !== "true"
  ) {
    return { status: "invalid", mode: "live" };
  }

  const secretKey = env.STRIPE_SECRET_KEY?.trim() || "";
  const publishableKey =
    env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  const monthly = env.STRIPE_PLUS_MONTHLY_PRICE_ID?.trim() || "";
  const annual = env.STRIPE_PLUS_ANNUAL_PRICE_ID?.trim() || "";
  const origin = applicationOrigin(env.NEXT_PUBLIC_APP_URL, rawMode);
  const secretMatch = secretKey.match(STRIPE_SECRET);
  const publishableMatch = publishableKey.match(STRIPE_PUBLISHABLE);
  if (
    secretMatch?.[1] !== rawMode ||
    publishableMatch?.[1] !== rawMode ||
    !STRIPE_WEBHOOK.test(webhookSecret) ||
    !STRIPE_PRICE.test(monthly) ||
    !STRIPE_PRICE.test(annual) ||
    monthly === annual ||
    !origin
  ) {
    return { status: "invalid", mode: rawMode };
  }

  return {
    status: "configured",
    mode: rawMode,
    secretKey,
    publishableKey,
    webhookSecret,
    priceIds: { monthly, annual },
    appOrigin: origin,
    livemode: rawMode === "live",
    purchasesEnabled:
      env.BIBLEQUEST_STRIPE_PURCHASES_ENABLED === "true",
    supportEnabled:
      env.BIBLEQUEST_STRIPE_SUPPORT_ENABLED === "true",
  };
}
