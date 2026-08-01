"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import {
  GentleButton,
  GentleLink,
} from "@/components/design-system/GentleButton";
import { IconClose } from "@/components/design-system/icons";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { FREE_DAILY_VERSE_REFRESH_LIMIT } from "@/lib/questos/verse-engine";

interface VerseRefreshLimitDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Keeps the free refresh allowance out of the verse card until the reader
 * asks for another verse after reaching the daily limit.
 */
export function VerseRefreshLimitDialog({
  open,
  onClose,
}: VerseRefreshLimitDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Trap focus, close on Escape, and restore the invoking refresh control.
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const appShell = document.querySelector<HTMLElement>("[data-app-shell]");
    const shellWasInert = appShell?.hasAttribute("inert") ?? false;
    document.body.style.overflow = "hidden";
    appShell?.setAttribute("inert", "");

    const node = dialogRef.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (!shellWasInert) appShell?.removeAttribute("inert");
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end bg-dusk/25 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="app-glass-surface w-full max-w-sm rounded-[var(--radius-card-lg)] border border-gold-500/35 bg-paper/90 p-5 paper-shadow-lg backdrop-blur-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-gilt ring-1 ring-gold-500/30">
            <PixelIcon name="crown" size={68} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close refresh limit message"
            className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-ash transition-colors hover:bg-linen hover:text-charcoal"
          >
            <IconClose size={19} />
          </button>
        </div>

        <h2
          id={titleId}
          className="mt-4 font-display text-[1.375rem] leading-tight text-graphite"
        >
          You’ve used your {FREE_DAILY_VERSE_REFRESH_LIMIT} refreshes today.
        </h2>
        <p
          id={descriptionId}
          className="mt-2 text-small leading-relaxed text-charcoal"
        >
          Upgrade to Plus for unlimited refreshes.
        </p>

        <div className="mt-5 grid gap-2.5">
          <GentleLink
            href="/app/plus"
            variant="gold"
            size="md"
            fullWidth
            onClick={onClose}
          >
            Explore Plus
          </GentleLink>
          <GentleButton
            type="button"
            variant="ghost"
            size="sm"
            fullWidth
            onClick={onClose}
          >
            Maybe later
          </GentleButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
