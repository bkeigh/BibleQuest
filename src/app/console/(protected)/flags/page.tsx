import {
  ConsoleEmptyState,
  ConsolePageHeader,
  ConsolePanel,
  ConsoleSourceNotice,
  ConsoleStatus,
} from "@/components/console/ConsolePrimitives";
import { loadConsoleFlags } from "@/lib/console/data.server";

export const dynamic = "force-dynamic";

/** Exposes rollout posture without permitting unaudited production mutations. */
export default async function ConsoleFlagsPage() {
  const result = await loadConsoleFlags();

  return (
    <>
      <ConsolePageHeader
        eyebrow="FEATURE FLAGS"
        title="Change exposure, not code."
        description="A read-only view of runtime gates. Percentage rollout, expiry, approvals, and audited writes come with the next schema boundary."
        actions={<ConsoleStatus tone="neutral">Read-only</ConsoleStatus>}
      />

      <ConsoleSourceNotice source={result.source} />

      <ConsolePanel
        title="Flag registry"
        description="Disabled flags remain visible to operators even though clients cannot read them."
      >
        {result.flags.length === 0 ? (
          <ConsoleEmptyState
            title="No flags available"
            description={
              result.source.status === "setup_required"
                ? "Connect the server operator key to inspect the full flag registry."
                : "The production registry is empty."
            }
          />
        ) : (
          <div className="console-flag-list">
            {result.flags.map((flag) => (
              <article key={flag.key} className="console-flag-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-[0.82rem] font-medium text-graphite">
                      {flag.key}
                    </h2>
                    <ConsoleStatus tone={flag.enabled ? "good" : "neutral"}>
                      {flag.enabled ? "enabled" : "disabled"}
                    </ConsoleStatus>
                  </div>
                  <p className="mt-2 text-caption leading-relaxed text-ash">
                    {flag.description}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="console-eyebrow">AUDIENCE</p>
                  <p className="mt-2 text-caption text-charcoal">
                    {flag.audience}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </ConsolePanel>

      <div className="console-callout">
        <p className="font-medium text-graphite">Next control boundary</p>
        <p className="mt-1 text-caption leading-relaxed text-ash">
          Every future flag change will require a reason, actor, before/after
          value, expiry date, and protected audit record.
        </p>
      </div>
    </>
  );
}
