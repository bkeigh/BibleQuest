import {
  ConsolePageHeader,
  ConsolePanel,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { buildReleaseHealth } from "@/lib/observability/release";
import { statusTone } from "@/lib/console/format";

export const dynamic = "force-dynamic";

/** Turns the bounded health contract into an operator release checklist. */
export default function ConsoleReleasesPage() {
  const release = buildReleaseHealth();
  const checks = [
    {
      name: "Canonical origin",
      value: release.canonical_origin_matches ? "matched" : "mismatch",
      tone: release.canonical_origin_matches ? "good" : "danger",
      note: release.canonical_origin,
    },
    {
      name: "Account posture",
      value: release.auth_posture,
      tone: statusTone(release.auth_posture),
      note: "Auth and sync must match the approved launch posture.",
    },
    {
      name: "Analytics",
      value: release.analytics_posture,
      tone: statusTone(release.analytics_posture),
      note: "Consent-gated product analytics remain separate.",
    },
    {
      name: "Schema contract",
      value: release.schema_contract,
      tone: "good",
      note: "Expected production migration boundary.",
    },
    {
      name: "Content contract",
      value: release.content_contract,
      tone: "good",
      note: "Seed manifest identity.",
    },
    {
      name: "Service worker",
      value: release.service_worker_version,
      tone: "good",
      note: "Installed PWA upgrade target.",
    },
    {
      name: "Billing",
      value: release.billing_mode,
      tone: statusTone(release.billing_mode),
      note: release.billing_purchases_enabled
        ? "Purchase controls enabled."
        : "Purchase controls hidden.",
    },
    {
      name: "One-time support",
      value: release.billing_support_enabled ? "enabled" : "disabled",
      tone: release.billing_support_enabled ? "good" : "neutral",
      note: "Separate deny-by-default support payment gate.",
    },
  ] as const;

  return (
    <>
      <ConsolePageHeader
        eyebrow="RELEASE COMMAND CENTER"
        title="Know what is live."
        description="One release identity across application code, database contracts, content, billing, and the installed PWA."
      />

      <section className="console-release-identity">
        <div>
          <p className="console-eyebrow">DEPLOYED RELEASE</p>
          <p className="mt-3 font-mono text-[1rem] text-graphite">
            {release.release_sha?.slice(0, 12) ?? "SHA unavailable"}
          </p>
        </div>
        <div>
          <p className="console-eyebrow">ROLLBACK TARGET</p>
          <p className="mt-3 font-mono text-[1rem] text-graphite">
            {release.rollback_sha?.slice(0, 12) ?? "Not approved"}
          </p>
        </div>
        <ConsoleStatus
          tone={
            release.status === "ok" && release.canonical_origin_matches
              ? "good"
              : "danger"
          }
        >
          {release.status === "ok" && release.canonical_origin_matches
            ? "Healthy"
            : "Hold"}
        </ConsoleStatus>
      </section>

      <ConsolePanel
        title="Launch gates"
        description="A mismatch is a stop signal, not a cosmetic warning."
      >
        <div className="console-check-grid">
          {checks.map((check) => (
            <article key={check.name} className="console-check-card">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium text-graphite">{check.name}</h2>
                <ConsoleStatus tone={check.tone}>{check.value}</ConsoleStatus>
              </div>
              <p className="mt-3 text-caption leading-relaxed text-ash">
                {check.note}
              </p>
            </article>
          ))}
        </div>
      </ConsolePanel>

      <div className="console-callout">
        <p className="font-medium text-graphite">Write controls stay outside V1.</p>
        <p className="mt-1 text-caption leading-relaxed text-ash">
          Production promotion and rollback remain deliberate human actions
          until console audit records and approval policy are installed.
        </p>
      </div>
    </>
  );
}
