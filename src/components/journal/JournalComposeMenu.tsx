"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconClose, IconPlus } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

type JournalComposeMenuProps = {
  open: boolean;
  onClose: () => void;
  prompt: { id: string; text: string };
};

export function JournalComposeMenu({
  open,
  onClose,
  prompt,
}: JournalComposeMenuProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-dusk/25 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div
          className="flex min-h-full items-end px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[var(--radius-card)] border border-mist bg-parchment p-4 paper-shadow-lg sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.75rem] uppercase tracking-[0.14em] text-accent">
                  Prayer Journal
                </p>
                <h2 id={titleId} className="mt-0.5 font-display text-[1.25rem] text-graphite">
                  New entry
                </h2>
              </div>
              <button
                type="button"
                autoFocus
                aria-label="Close new entry menu"
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ash hover:bg-linen hover:text-graphite"
              >
                <IconClose size={20} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <EntryLink
                href="/app/prayer/new"
                title="Prayer"
                detail="Speak honestly with God."
                icon="candle"
                onClick={onClose}
              />
              <EntryLink
                href="/app/prayer/reflection/new"
                title="Reflection"
                detail="Notice what is taking shape."
                icon="sun"
                onClick={onClose}
              />
            </div>

            <div className="mt-3 rounded-[var(--radius-button)] border border-gold-500/35 bg-gold-500/10 p-4">
              <p className="text-[0.75rem] uppercase tracking-[0.12em] text-gilt">
                A prompt for today
              </p>
              <p className="mt-1.5 font-display text-[1.0625rem] leading-snug text-graphite">
                {prompt.text}
              </p>
              <Link
                href={`/app/prayer/reflection/new?prompt=${encodeURIComponent(prompt.id)}`}
                onClick={onClose}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full text-[0.875rem] font-medium text-accent"
              >
                <IconPlus size={16} /> Write about this
              </Link>
            </div>

            <p className="mt-3 text-[0.75rem] leading-relaxed text-ash">
              Prompts are built into BibleQuest. They do not inspect your
              entries, photos, contacts, or location.
            </p>
          </motion.div>
        </div>
      )}
    </dialog>
  );
}

function EntryLink({
  href,
  title,
  detail,
  icon,
  onClick,
}: {
  href: string;
  title: string;
  detail: string;
  icon: "candle" | "sun";
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "min-h-32 rounded-[var(--radius-button)] border border-mist bg-paper p-3.5",
        "transition-colors hover:border-accent/45 hover:bg-linen focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      <PixelIcon name={icon} size={5} />
      <p className="mt-3 font-medium text-graphite">{title}</p>
      <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ash">{detail}</p>
    </Link>
  );
}
