import type { ConsoleTopQuest } from "@/lib/console/insights";

/** Ranks aggregate quest completion volume for content stewardship. */
export function ConsoleTopQuestChart({
  quests,
}: {
  quests: ConsoleTopQuest[];
}) {
  const maximum = Math.max(1, ...quests.map((quest) => quest.completions));

  return (
    <ol className="console-ranked-bars">
      {quests.map((quest) => (
        <li key={quest.slug}>
          <div>
            <span>{quest.title}</span>
            <strong>{quest.completions}</strong>
          </div>
          <span className="console-ranked-track">
            <i
              style={{
                width: `${Math.round((quest.completions / maximum) * 100)}%`,
              }}
            />
          </span>
        </li>
      ))}
    </ol>
  );
}
