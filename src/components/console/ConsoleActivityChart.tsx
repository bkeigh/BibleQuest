import type { ConsoleInsightDay } from "@/lib/console/insights";

/** Formats compact chart ticks without hiding exact values in accessible text. */
function compact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Formats UTC date keys consistently across server regions. */
function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

/** Plots quest volume and participating accounts on a shared daily axis. */
export function ConsoleActivityChart({
  daily,
}: {
  daily: ConsoleInsightDay[];
}) {
  const width = 760;
  const height = 238;
  const left = 44;
  const right = 16;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(
    1,
    ...daily.flatMap((day) => [
      day.questCompletions,
      day.activeQuesters,
    ]),
  );
  const step = daily.length > 0 ? plotWidth / daily.length : plotWidth;
  const barWidth = Math.max(2, Math.min(14, step * 0.58));
  const x = (index: number) => left + step * index + step / 2;
  const y = (value: number) =>
    top + plotHeight - (value / maximum) * plotHeight;
  const line = daily
    .map((day, index) => `${x(index)},${y(day.activeQuesters)}`)
    .join(" ");
  const labelEvery = Math.max(1, Math.ceil(daily.length / 6));

  return (
    <div className="console-chart-wrap">
      <div className="console-chart-legend" aria-hidden="true">
        <span>
          <i className="console-legend-swatch console-legend-quests" />
          Quest completions
        </span>
        <span>
          <i className="console-legend-line" />
          Active questers
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="console-chart"
        role="img"
        aria-labelledby="console-activity-title console-activity-description"
      >
        <title id="console-activity-title">Daily quest activity</title>
        <desc id="console-activity-description">
          Daily quest completions shown as bars and distinct participating
          accounts shown as a line.
        </desc>

        {[0, 0.5, 1].map((ratio) => {
          const value = Math.round(maximum * ratio);
          const lineY = y(value);
          return (
            <g key={ratio}>
              <line
                x1={left}
                x2={width - right}
                y1={lineY}
                y2={lineY}
                className="console-chart-grid"
              />
              <text
                x={left - 8}
                y={lineY + 4}
                textAnchor="end"
                className="console-chart-axis"
              >
                {compact(value)}
              </text>
            </g>
          );
        })}

        {daily.map((day, index) => {
          const barTop = y(day.questCompletions);
          return (
            <rect
              key={day.date}
              x={x(index) - barWidth / 2}
              y={barTop}
              width={barWidth}
              height={Math.max(0, top + plotHeight - barTop)}
              rx={Math.min(2, barWidth / 3)}
              className="console-chart-bar"
            >
              <title>{`${shortDate(day.date)}: ${day.questCompletions} completions`}</title>
            </rect>
          );
        })}

        <polyline points={line} className="console-chart-line" />

        {daily.map((day, index) =>
          index % Math.max(1, Math.ceil(daily.length / 30)) === 0 ||
          index === daily.length - 1 ? (
            <circle
              key={day.date}
              cx={x(index)}
              cy={y(day.activeQuesters)}
              r="2.7"
              className="console-chart-point"
            >
              <title>{`${shortDate(day.date)}: ${day.activeQuesters} active questers`}</title>
            </circle>
          ) : null,
        )}

        {daily.map((day, index) =>
          index % labelEvery === 0 || index === daily.length - 1 ? (
            <text
              key={day.date}
              x={x(index)}
              y={height - 10}
              textAnchor="middle"
              className="console-chart-axis"
            >
              {shortDate(day.date)}
            </text>
          ) : null,
        )}
      </svg>

      <table className="sr-only">
        <caption>Daily quest activity data</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Quest completions</th>
            <th>Active questers</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{day.questCompletions}</td>
              <td>{day.activeQuesters}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
