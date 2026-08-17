import { cn } from "@/lib/utils/cn";

interface RingProps {
  className?: string;
  /**
   * Announces the wait to assistive tech. Omit inside a surface that already
   * carries its own live region, so the wait is announced exactly once.
   */
  label?: string;
}

/**
 * A quiet indeterminate ring in the brand green.
 *
 * Styled entirely in CSS and SVG so it paints with the document rather than
 * waiting on hydration — a loading indicator that needs the app bundle to
 * appear cannot cover the part of startup that actually feels slow.
 *
 * Drawn in viewBox units rather than with a border so stroke weight stays
 * proportional at every size: one component reads correctly at `size-8` beside
 * a button and at `size-32` on a full-screen hold.
 */
export function Ring({ className, label }: RingProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("bq-ring", className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle className="bq-ring-track" cx="50" cy="50" r="45" />
      <circle className="bq-ring-arc" cx="50" cy="50" r="45" />
    </svg>
  );
}
