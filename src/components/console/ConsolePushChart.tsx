import type { ConsoleInsightDay } from "@/lib/console/insights";

/** Formats compact push-volume ticks for dense date ranges. */
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

/** Stacks delivery outcomes by day so provider regressions stand out. */
export function ConsolePushChart({
  daily,
}: {
  daily: ConsoleInsightDay[];
}) {
  const width = 760;
  const height = 170;
  const left = 44;
  const right = 16;
  const top = 14;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(
    1,
    ...daily.map((day) => day.pushSent + day.pushFailed + day.pushPending),
  );
  const step = daily.length > 0 ? plotWidth / daily.length : plotWidth;
  const barWidth = Math.max(2, Math.min(14, step * 0.62));
  const labelEvery = Math.max(1, Math.ceil(daily.length / 6));

  return (
    <div className="console-chart-wrap">
      <div className="console-chart-legend" aria-hidden="true">
        <span>
          <i className="console-legend-swatch console-legend-push-sent" />
          Sent
        </span>
        <span>
          <i className="console-legend-swatch console-legend-push-pending" />
          Pending
        </span>
        <span>
          <i className="console-legend-swatch console-legend-push-failed" />
          Failed
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="console-chart console-chart-compact"
        role="img"
        aria-labelledby="console-push-title console-push-description"
      >
        <title id="console-push-title">Push delivery outcomes</title>
        <desc id="console-push-description">
          Daily sent, pending, and failed push deliveries excluding tests.
        </desc>
        <line
          x1={left}
          x2={width - right}
          y1={top + plotHeight}
          y2={top + plotHeight}
          className="console-chart-grid"
        />
        <text
          x={left - 8}
          y={top + 4}
          textAnchor="end"
          className="console-chart-axis"
        >
          {compact(maximum)}
        </text>

        {daily.map((day, index) => {
          const values = [
            { key: "sent", value: day.pushSent },
            { key: "pending", value: day.pushPending },
            { key: "failed", value: day.pushFailed },
          ] as const;
          let running = 0;
          const center = left + step * index + step / 2;
          return (
            <g key={day.date}>
              {values.map((segment) => {
                const segmentHeight =
                  (segment.value / maximum) * plotHeight;
                const segmentY =
                  top + plotHeight - running - segmentHeight;
                running += segmentHeight;
                return (
                  <rect
                    key={segment.key}
                    x={center - barWidth / 2}
                    y={segmentY}
                    width={barWidth}
                    height={Math.max(0, segmentHeight)}
                    className={`console-push-${segment.key}`}
                  >
                    <title>{`${shortDate(day.date)}: ${segment.value} ${segment.key}`}</title>
                  </rect>
                );
              })}
              {index % labelEvery === 0 || index === daily.length - 1 ? (
                <text
                  x={center}
                  y={height - 8}
                  textAnchor="middle"
                  className="console-chart-axis"
                >
                  {shortDate(day.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>Daily push delivery outcomes</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Sent</th>
            <th>Pending</th>
            <th>Failed</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{day.pushSent}</td>
              <td>{day.pushPending}</td>
              <td>{day.pushFailed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
