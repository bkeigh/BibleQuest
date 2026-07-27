import { cn } from "@/lib/utils/cn";
import type { ConsoleDataSource } from "@/lib/console/data.server";

/** Opens a console screen with clear purpose and optional context. */
export function ConsolePageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="console-page-header">
      <div className="max-w-3xl">
        <p className="console-eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[clamp(2rem,4vw,3.25rem)] leading-[1.04] font-medium tracking-[-0.035em] text-graphite">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-small leading-relaxed text-ash">
          {description}
        </p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

/** Displays one primary operator metric with compact supporting context. */
export function ConsoleMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "default" | "good" | "warning";
}) {
  return (
    <article className={cn("console-metric", `console-metric-${tone}`)}>
      <p className="console-eyebrow">{label}</p>
      <p className="mt-4 font-display text-[2.2rem] leading-none font-medium tracking-[-0.04em] text-graphite">
        {value}
      </p>
      <p className="mt-3 text-caption leading-relaxed text-ash">{detail}</p>
    </article>
  );
}

/** Normalizes operational states into calm, high-contrast status labels. */
export function ConsoleStatus({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "good" | "warning" | "danger" | "neutral";
}) {
  return (
    <span className={cn("console-status", `console-status-${tone}`)}>
      <span className="console-status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Makes live, partial, and setup data unmistakable on every screen. */
export function ConsoleSourceNotice({
  source,
}: {
  source: ConsoleDataSource;
}) {
  const tone =
    source.status === "live"
      ? "good"
      : source.status === "degraded"
        ? "warning"
        : "neutral";

  return (
    <div className="console-source-notice" role="status">
      <ConsoleStatus tone={tone}>
        {source.status === "live"
          ? "Live"
          : source.status === "degraded"
            ? "Partial"
            : "Setup"}
      </ConsoleStatus>
      <p>{source.label}</p>
    </div>
  );
}

/** Gives grouped console data a consistent editorial surface. */
export function ConsolePanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("console-panel", className)}>
      <div className="console-panel-heading">
        <div>
          <h2 className="font-display text-[1.35rem] font-medium tracking-[-0.02em] text-graphite">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-caption leading-relaxed text-ash">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Explains a valid empty state without implying an operational failure. */
export function ConsoleEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="console-empty">
      <p className="font-display text-[1.15rem] text-graphite">{title}</p>
      <p className="mt-1 max-w-lg text-caption leading-relaxed text-ash">
        {description}
      </p>
    </div>
  );
}
