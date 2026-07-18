"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconClose, IconShare } from "@/components/design-system/icons";
import { useToast } from "@/components/design-system/Toast";
import { useStrings } from "@/lib/i18n";
import { track } from "@/lib/analytics/events";

interface VerseShareSheetProps {
  open: boolean;
  title: string;
  text: string;
  url: string;
  /** Explains when the share-safe WEB wording differs from the edition shown. */
  notice?: string;
  onClose: () => void;
}

/** Clipboard API first, with a small legacy fallback for restricted webviews. */
async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Continue to the selection fallback below.
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    field.remove();
  }
  return copied;
}

/**
 * Accessible share chooser. It is intentionally mounted only while open,
 * traps focus, closes on Escape/backdrop, restores the invoking control, and
 * previews the exact wording before any native handoff or copy action.
 */
export function VerseShareSheet({
  open,
  title,
  text,
  url,
  notice,
  onClose,
}: VerseShareSheetProps) {
  const t = useStrings();
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [nativeSharing, setNativeSharing] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const node = dialogRef.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
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
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sharedBody = `${text}\n\n${url}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(sharedBody)}`;
  const smsHref = `sms:?&body=${encodeURIComponent(sharedBody)}`;

  async function copy(value: string, successMessage: string) {
    if (await copyText(value)) {
      toast(successMessage, { variant: "success" });
      track("verse_shared");
      onClose();
    } else {
      toast(t.home.shareCopyFailed);
    }
  }

  async function shareNatively() {
    if (nativeSharing || typeof navigator.share !== "function") return;
    setNativeSharing(true);
    try {
      await navigator.share({ title, text, url });
      track("verse_shared");
      onClose();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast("We couldn’t open your device’s share options. Try one below.");
      }
    } finally {
      setNativeSharing(false);
    }
  }

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
        className="w-full max-w-md rounded-[var(--radius-card-lg)] border border-mist bg-paper p-5 paper-shadow-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-caption uppercase tracking-[0.14em] text-accent">
              <IconShare size={15} /> Share Scripture
            </p>
            <h2 id={titleId} className="mt-1 font-display text-subheading text-graphite">
              Choose how to share
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share options"
            className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-ash transition-colors hover:bg-linen hover:text-charcoal"
          >
            <IconClose size={19} />
          </button>
        </div>

        {notice && (
          <p
            role="note"
            className="mt-3 rounded-[10px] bg-linen px-3 py-2.5 text-caption leading-relaxed text-charcoal"
          >
            {notice}
          </p>
        )}

        <p className="mt-3 line-clamp-3 text-small leading-relaxed text-charcoal">
          {text}
        </p>

        {typeof navigator.share === "function" && (
          <GentleButton
            variant="primary"
            size="md"
            fullWidth
            className="mt-5"
            disabled={nativeSharing}
            aria-busy={nativeSharing}
            onClick={() => void shareNatively()}
          >
            <IconShare size={16} />
            {nativeSharing ? "Opening share options…" : "More share options"}
          </GentleButton>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <GentleButton
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => copy(url, "Verse link copied.")}
          >
            Copy link
          </GentleButton>
          <GentleButton
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => copy(text, t.home.shareCopied)}
          >
            Copy verse
          </GentleButton>
          <a
            href={emailHref}
            onClick={() => {
              track("verse_shared");
              onClose();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] border border-mist px-3.5 py-2 text-small font-medium text-charcoal transition-colors hover:bg-linen"
          >
            Email
          </a>
          <a
            href={smsHref}
            onClick={() => {
              track("verse_shared");
              onClose();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-button)] border border-mist px-3.5 py-2 text-small font-medium text-charcoal transition-colors hover:bg-linen"
          >
            Text message
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
