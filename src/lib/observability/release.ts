import observability from "../../../config/observability.json";
import { stripeBillingAvailability } from "@/lib/billing/config";
import { ACCOUNT_SYNC_CONTAINED } from "@/lib/sync/containment";
import { supabasePublishableKey } from "@/lib/supabase/config";

const SHA = /^[a-f0-9]{40}$/i;

// Next.js replaces this static access with the public release identity captured
// by next.config.ts, so it survives a runtime environment without CI metadata.
const BUNDLED_BUILD_SHA = process.env.BIBLEQUEST_BUILD_SHA;

export type AuthPosture = "configured" | "guest-only" | "invalid";
export type AnalyticsPosture = "configured" | "disabled" | "invalid";

export interface ReleaseHealth {
  status: "ok";
  app: "biblequest";
  contract: string;
  release_sha: string | null;
  rollback_sha: string | null;
  canonical_origin: string;
  canonical_origin_matches: boolean;
  auth_posture: AuthPosture;
  analytics_posture: AnalyticsPosture;
  schema_contract: string;
  content_contract: string;
  service_worker_version: string;
  billing_mode: "coming-soon" | "test" | "live" | "invalid";
  billing_purchases_enabled: boolean;
  billing_support_enabled: boolean;
}

type PublicEnvironment = Record<string, string | undefined>;

/** Returns a SHA only when it is safe to expose as release identity. */
function safeSha(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate && SHA.test(candidate) ? candidate.toLowerCase() : null;
}

/** Trusts the runtime provider identity, then the immutable bundled identity. */
function releaseSha(env: PublicEnvironment): string | null {
  return safeSha(env.VERCEL_GIT_COMMIT_SHA) ?? safeSha(BUNDLED_BUILD_SHA);
}

/** Reports configuration shape without exposing a Supabase host or key. */
function authPosture(
  env: PublicEnvironment,
  accountSyncContained: boolean,
): AuthPosture {
  const hasUrl = Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasKey = Boolean(supabasePublishableKey(env));
  if (hasUrl && hasKey) {
    return accountSyncContained ? "guest-only" : "configured";
  }
  if (!hasUrl && !hasKey) return "guest-only";
  return "invalid";
}

/** Reports analytics enablement without exposing a configured analytics host. */
function analyticsPosture(env: PublicEnvironment): AnalyticsPosture {
  if (env.NEXT_PUBLIC_ANALYTICS_ENABLED !== "true") return "disabled";
  const domain = env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  if (!domain || domain.length > 253 || domain.includes("..")) return "invalid";
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(domain)) return "invalid";
  return "configured";
}

/** Collapses full Stripe configuration to bounded mode and purchase posture. */
function billingPosture(env: PublicEnvironment): {
  mode: ReleaseHealth["billing_mode"];
  purchasesEnabled: boolean;
  supportEnabled: boolean;
} {
  const billing = stripeBillingAvailability(env);
  return billing.status === "configured"
    ? {
        mode: billing.mode,
        purchasesEnabled: billing.purchasesEnabled,
        supportEnabled: billing.supportEnabled,
      }
    : {
        mode: billing.status === "coming-soon" ? "coming-soon" : "invalid",
        purchasesEnabled: false,
        supportEnabled: false,
      };
}

/** Builds a content-free release identity for external health evidence. */
export function buildReleaseHealth(
  env: PublicEnvironment = process.env,
  accountSyncContained = ACCOUNT_SYNC_CONTAINED,
): ReleaseHealth {
  const billing = billingPosture(env);
  return {
    status: "ok",
    app: "biblequest",
    contract: observability.contract,
    release_sha: releaseSha(env),
    rollback_sha: safeSha(env.BIBLEQUEST_ROLLBACK_SHA),
    canonical_origin: observability.canonicalOrigin,
    canonical_origin_matches:
      env.NEXT_PUBLIC_APP_URL?.trim() === observability.canonicalOrigin,
    auth_posture: authPosture(env, accountSyncContained),
    analytics_posture: analyticsPosture(env),
    schema_contract: observability.schemaContract,
    content_contract: observability.contentContract,
    service_worker_version: observability.serviceWorkerVersion,
    billing_mode: billing.mode,
    billing_purchases_enabled: billing.purchasesEnabled,
    billing_support_enabled: billing.supportEnabled,
  };
}
