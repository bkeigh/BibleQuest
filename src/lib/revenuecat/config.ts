/**
 * Parses the public, build-time RevenueCat configuration into a small trusted
 * state machine. Checkout stays disabled unless the selected billing mode and
 * public SDK key agree, so a stray environment variable cannot enable sales.
 */
export type RevenueCatBillingMode = "coming-soon" | "sandbox" | "live";

export type RevenueCatConfigurationStatus =
  | "coming-soon"
  | "unconfigured"
  | "invalid"
  | "sandbox"
  | "live";

export interface RevenueCatConfiguration {
  status: RevenueCatConfigurationStatus;
  mode: RevenueCatBillingMode;
  configured: boolean;
  apiKey: string | null;
}
const TEST_PUBLIC_KEY = /^test_[A-Za-z0-9]+$/;
const WEB_PUBLIC_KEY = /^rcb_[A-Za-z0-9]+$/;

/**
 * Billing is deny-by-default. A key alone never enables checkout: the matching
 * mode must also be selected explicitly at build time.
 */
export function parseRevenueCatConfiguration(
  rawMode: string | undefined,
  rawApiKey: string | undefined,
): RevenueCatConfiguration {
  const mode = rawMode || "coming-soon";
  const apiKey = rawApiKey || null;

  if (mode === "coming-soon") {
    return {
      status: "coming-soon",
      mode,
      configured: false,
      apiKey: null,
    };
  }

  if (mode !== "sandbox" && mode !== "live") {
    return {
      status: "invalid",
      mode: "coming-soon",
      configured: false,
      apiKey: null,
    };
  }

  if (!apiKey) {
    return { status: "unconfigured", mode, configured: false, apiKey: null };
  }

  const validForMode =
    mode === "sandbox"
      ? TEST_PUBLIC_KEY.test(apiKey)
      : WEB_PUBLIC_KEY.test(apiKey);

  if (!validForMode) {
    return { status: "invalid", mode, configured: false, apiKey: null };
  }

  return { status: mode, mode, configured: true, apiKey };
}
