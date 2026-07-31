"use client";

/**
 * InfoHint — a quiet "i" button that holds explanatory copy until it is asked
 * for.
 *
 * Screens in BibleQuest tend to explain themselves before the reader has done
 * anything: privacy notes, provenance lines, and scope caveats stacked above
 * the control they describe. That copy is worth keeping — it just should not
 * be the first thing a reader meets. InfoHint moves it one tap away.
 *
 * - Real <button> with aria-expanded / aria-controls, so the relationship is
 *   announced rather than implied by position.
 * - The panel is plain text in the flow (not a floating popover), so it never
 *   traps focus, never needs collision detection, and reflows on small screens.
 * - Uses the same grid-template-rows 0fr→1fr collapse as Disclosure, which
 *   both reduced-motion kill-switches flatten automatically.
 *
 * Use it for supporting detail. Anything a reader must see to act safely
 * belongs in the always-visible copy.
 */
import { useId, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { IconInfo } from "./icons";

interface InfoHintProps {
  /** What the button reveals, e.g. "how MyShepherd handles your question". */
  label: string;
  children: React.ReactNode;
  /** Matches the surface it sits on. */
  tone?: "default" | "onDark";
  className?: string;
}

export function InfoHint({
  label,
  children,
  tone = "default",
  className,
}: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const panelId = `${baseId}-panel`;
  const onDark = tone === "onDark";

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          // 44px hit target without a 44px footprint: the icon stays small and
          // the padding does the reaching.
          "-m-2 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] p-2",
          "text-caption font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          onDark
            ? "text-white/75 hover:text-white focus-visible:outline-white"
            : "text-ash hover:text-charcoal focus-visible:outline-accent",
        )}
      >
        <IconInfo />
        <span>{label}</span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-gentle)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div inert={!open} className="min-h-0 overflow-hidden">
          <p
            className={cn(
              "pt-2 text-caption leading-relaxed",
              onDark ? "text-white/80" : "text-ash",
            )}
          >
            {children}
          </p>
        </div>
      </div>
    </div>
  );
}
