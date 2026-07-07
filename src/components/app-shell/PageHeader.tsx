import { cn } from "@/lib/utils/cn";

/**
 * Quiet in-app page header. One editorial heading, optional subtitle,
 * optional trailing action. Safe-area aware at the top.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mx-auto w-full max-w-2xl px-5 pt-safe sm:px-8",
        className
      )}
    >
      <div className="flex items-end justify-between gap-4 pt-8 pb-2">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight text-graphite">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[0.9375rem] text-ash">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
}

/** Shared max-width content column for app pages. */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-2xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}
