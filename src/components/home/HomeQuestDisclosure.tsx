"use client";

/**
 * Holds the unified Home quest collection. The outer drawer starts open while
 * nested status drawers keep the page compact. Both the current and legacy
 * hashes open the collection and return keyboard focus to its trigger.
 */
import { useEffect, useId, useRef, useState } from "react";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { IconChevronRight } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

interface HomeQuestDisclosureProps {
  title: string;
  summary: string;
  announcement: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}

export function HomeQuestDisclosure({
  title,
  summary,
  announcement,
  defaultOpen,
  children,
}: HomeQuestDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Quest detail actions return to this hash; opening before focus keeps the
    // destination useful for keyboard and assistive-technology users.
    function openFromHash() {
      if (
        window.location.hash !== "#quests" &&
        window.location.hash !== "#active-quests"
      ) {
        return;
      }
      setOpen(true);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  return (
    <section
      id="active-quests"
      className="scroll-mt-6 outline-none"
    >
      {/* New links use #quests; the section ID preserves old saved links. */}
      <span id="quests" className="block scroll-mt-6" />
      <h2>
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
          className="app-glass-surface group flex min-h-[4.75rem] w-full items-center gap-3 rounded-[var(--radius-card)] border border-mist bg-linen px-4 py-3 text-left paper-shadow transition-colors duration-300 hover:border-accent/40 hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-linen sm:px-5"
        >
          <span className="flex shrink-0 items-center justify-center">
            <ArtIcon name="scroll" size={80} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-art-label text-[1.25rem] uppercase leading-tight tracking-[0.05em] text-accent min-[380px]:text-[1.5rem]">
              {title}
            </span>
            <span className="mt-1 block text-caption leading-snug text-ash">
              {summary}
            </span>
          </span>
          <IconChevronRight
            aria-hidden="true"
            className={cn(
              "shrink-0 rotate-90 text-ash transition-transform duration-300 [transition-timing-function:var(--ease-gentle)]",
              open && "-rotate-90",
            )}
          />
        </button>
      </h2>

      {/* Store changes stay audible even while the visual details are inert. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-gentle)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div inert={!open} className="min-h-0 overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
