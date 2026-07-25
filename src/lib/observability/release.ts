import observability from "../../../config/observability.json";
import { parseRevenueCatConfiguration } from "@/lib/revenuecat/config";

const SHA = /^[a-f0-9]{40}$/i;

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
  billing_mode: "coming-soon" | "sandbox" | "live" | "invalid";
}

type PublicEnvironment = Record<string, string | undefined>;

/** Returns a SHA only when it is safe to expose as release identity. */
function safeSha(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate && SHA.test(candidate) ? candidate.toLowerCase() : null;
}

/** Reports configuration shape without exposing a Supabase host or key. */
function authPosture(env: PublicEnvironment): AuthPosture {
  const hasUrl = Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasKey = Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  if (hasUrl && hasKey) return "configured";
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

/** Collapses the RevenueCat parser to the only billing states safe for health. */
function billingMode(env: PublicEnvironment): ReleaseHealth["billing_mode"] {
  const billing = parseRevenueCatConfiguration(
    env.NEXT_PUBLIC_REVENUECAT_BILLING_MODE,
    env.NEXT_PUBLIC_REVENUECAT_PUBLIC_KEY,
  );
  return billing.status === "coming-soon" ||
    billing.status === "sandbox" ||
    billing.status === "live"
    ? billing.status
    : "invalid";
}

/** Builds a content-free release identity for external health evidence. */
export function buildReleaseHealth(
  env: PublicEnvironment = process.env,
): ReleaseHealth {
  return {
    status: "ok",
    app: "biblequest",
    contract: observability.contract,
    release_sha: safeSha(env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA),
    rollback_sha: safeSha(env.BIBLEQUEST_ROLLBACK_SHA),
    canonical_origin: observability.canonicalOrigin,
    canonical_origin_matches:
      env.NEXT_PUBLIC_APP_URL?.trim() === observability.canonicalOrigin,
    auth_posture: authPosture(env),
    analytics_posture: analyticsPosture(env),
    schema_contract: observability.schemaContract,
    content_contract: observability.contentContract,
    service_worker_version: observability.serviceWorkerVersion,
    billing_mode: billingMode(env),
  };
}
