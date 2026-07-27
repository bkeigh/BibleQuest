import type { ConsoleInsightFunnel } from "@/lib/console/insights";

/** Shows account activation as a cohort funnel without exposing identities. */
export function ConsoleActivationFunnel({
  funnel,
}: {
  funnel: ConsoleInsightFunnel;
}) {
  const stages = [
    { label: "Accounts created", value: funnel.accountsCreated },
    { label: "Onboarding complete", value: funnel.onboardingCompleted },
    { label: "First quest", value: funnel.firstQuest },
    { label: "Repeat quest day", value: funnel.repeatQuest },
  ];
  const baseline = Math.max(1, funnel.accountsCreated);

  return (
    <ol className="console-funnel">
      {stages.map((stage, index) => {
        const percentage =
          index === 0 && funnel.accountsCreated === 0
            ? 0
            : Math.round((stage.value / baseline) * 100);
        return (
          <li key={stage.label} className="console-funnel-stage">
            <div className="console-funnel-label">
              <span>{stage.label}</span>
              <strong>{stage.value}</strong>
            </div>
            <div
              className="console-funnel-track"
              role="img"
              aria-label={`${stage.label}: ${stage.value}, ${percentage}% of accounts created`}
            >
              <span style={{ width: `${Math.min(100, percentage)}%` }} />
            </div>
            <p>{percentage}% of cohort</p>
          </li>
        );
      })}
    </ol>
  );
}
