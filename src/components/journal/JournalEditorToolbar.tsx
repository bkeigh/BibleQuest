"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { JournalEntryBody } from "@/components/journal/JournalEntryBody";
import { cn } from "@/lib/utils/cn";

export function countJournalWords(value: string): number {
  const words = value.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu);
  return words?.length ?? 0;
}

export type JournalFormat = "bold" | "italic" | "list" | "quote";

export type JournalSelection = {
  start: number;
  end: number;
};

type JournalFormatResult = {
  value: string;
  selection: JournalSelection;
};

/** Counts adjacent marker characters immediately before one selection edge. */
function markerRunBefore(value: string, index: number): number {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "*"; cursor -= 1) {
    count += 1;
  }
  return count;
}

/** Counts adjacent marker characters immediately after one selection edge. */
function markerRunAfter(value: string, index: number): number {
  let count = 0;
  for (
    let cursor = index;
    cursor < value.length && value[cursor] === "*";
    cursor += 1
  ) {
    count += 1;
  }
  return count;
}

/** Toggles one complete selected line while keeping its markup self-contained. */
function toggleInlineLine(line: string, format: "bold" | "italic"): string {
  if (!line) return line;
  const marker = format === "bold" ? "**" : "*";
  const leading = markerRunAfter(line, 0);
  const trailing = markerRunBefore(line, line.length);
  const applied =
    format === "bold"
      ? leading >= marker.length && trailing >= marker.length
      : leading % 2 === 1 && trailing % 2 === 1;
  return applied
    ? line.slice(marker.length, line.length - marker.length)
    : `${marker}${line}${marker}`;
}

/** Applies the editor's small, safe formatting vocabulary to a stable range. */
export function applyJournalFormat(
  value: string,
  selection: JournalSelection,
  format: JournalFormat,
): JournalFormatResult {
  const start = Math.max(0, Math.min(value.length, selection.start));
  const end = Math.max(start, Math.min(value.length, selection.end));

  if (format === "bold" || format === "italic") {
    const marker = format === "bold" ? "**" : "*";
    if (start === end) return { value, selection: { start, end } };
    const selected = value.slice(start, end);

    // Each line needs its own markers because the safe renderer deliberately
    // refuses inline markup that crosses a newline.
    if (selected.includes("\n")) {
      const formatted = selected
        .split("\n")
        .map((line) => toggleInlineLine(line, format))
        .join("\n");
      return {
        value: `${value.slice(0, start)}${formatted}${value.slice(end)}`,
        selection: { start, end: start + formatted.length },
      };
    }

    const before = markerRunBefore(value, start);
    const after = markerRunAfter(value, end);
    const applied =
      format === "bold"
        ? before >= marker.length && after >= marker.length
        : before % 2 === 1 && after % 2 === 1;
    if (applied) {
      return {
        value: `${value.slice(0, start - marker.length)}${selected}${value.slice(end + marker.length)}`,
        selection: {
          start: start - marker.length,
          end: end - marker.length,
        },
      };
    }

    const selectedLeading = markerRunAfter(selected, 0);
    const selectedTrailing = markerRunBefore(selected, selected.length);
    const selectedIsWrapped =
      format === "bold"
        ? selectedLeading >= marker.length &&
          selectedTrailing >= marker.length
        : selectedLeading % 2 === 1 && selectedTrailing % 2 === 1;
    if (selectedIsWrapped) {
      const unwrapped = selected.slice(
        marker.length,
        selected.length - marker.length,
      );
      return {
        value: `${value.slice(0, start)}${unwrapped}${value.slice(end)}`,
        selection: { start, end: start + unwrapped.length },
      };
    }

    const formatted = `${value.slice(0, start)}${marker}${value.slice(start, end)}${marker}${value.slice(end)}`;
    return {
      value: formatted,
      selection: {
        start: start + marker.length,
        end: end + marker.length,
      },
    };
  }

  const prefix = format === "list" ? "- " : "> ";
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const selectedLines = value.slice(lineStart, lineEnd).split("\n");
  const replacement = selectedLines.map((line) => `${prefix}${line}`).join("\n");

  return {
    value: `${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`,
    selection: {
      start: start + prefix.length,
      end: end + prefix.length * selectedLines.length,
    },
  };
}

type JournalEditorToolbarProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function JournalEditorToolbar({
  textareaRef,
  value,
  onChange,
  className,
}: JournalEditorToolbarProps) {
  const previewId = useId();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [formatMessage, setFormatMessage] = useState<string | null>(null);
  const selectionRef = useRef<JournalSelection>({ start: 0, end: 0 });

  // Capture selection before a touch moves focus from the textarea to a tool.
  function rememberSelection() {
    const field = textareaRef.current;
    if (!field) return;
    selectionRef.current = {
      start: field.selectionStart,
      end: field.selectionEnd,
    };
  }

  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;

    // Keyboard navigation and mobile text handles can change the range without
    // starting a pointer gesture on a formatting button.
    const captureSelection = () => {
      selectionRef.current = {
        start: field.selectionStart,
        end: field.selectionEnd,
      };
    };
    const events = ["select", "input", "keyup", "pointerup", "blur"] as const;
    events.forEach((event) => field.addEventListener(event, captureSelection));
    return () => {
      events.forEach((event) =>
        field.removeEventListener(event, captureSelection),
      );
    };
  }, [textareaRef]);

  function restoreSelection(start: number, end: number) {
    selectionRef.current = { start, end };
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start, end);
    });
  }

  function formatSelection(format: JournalFormat) {
    if (
      (format === "bold" || format === "italic") &&
      selectionRef.current.start === selectionRef.current.end
    ) {
      setFormatMessage(
        `Select text first to make it ${format === "bold" ? "bold" : "italic"}.`,
      );
      textareaRef.current?.focus();
      return;
    }
    const result = applyJournalFormat(value, selectionRef.current, format);
    onChange(result.value);
    setFormatMessage(
      `${format === "list" ? "List" : format[0].toUpperCase() + format.slice(1)} formatting updated.`,
    );
    setPreviewOpen(true);
    restoreSelection(result.selection.start, result.selection.end);
  }

  const wordCount = countJournalWords(value);

  return (
    <div className={cn("space-y-2", className)}>
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-1">
          <FormatButton
            label="Bold"
            onPressStart={rememberSelection}
            onClick={() => formatSelection("bold")}
          >
            <span className="font-semibold">B</span>
          </FormatButton>
          <FormatButton
            label="Italic"
            onPressStart={rememberSelection}
            onClick={() => formatSelection("italic")}
          >
            <span className="italic">I</span>
          </FormatButton>
          <FormatButton
            label="Bulleted list"
            onPressStart={rememberSelection}
            onClick={() => formatSelection("list")}
          >
            <span aria-hidden>•</span>
          </FormatButton>
          <FormatButton
            label="Quote"
            onPressStart={rememberSelection}
            onClick={() => formatSelection("quote")}
          >
            <span aria-hidden>“</span>
          </FormatButton>
        </div>
        <p
          className="shrink-0 text-[0.75rem] tabular-nums text-ash"
          aria-live="polite"
        >
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[0.75rem] leading-relaxed text-ash">
          Select text, then choose a style. Preview shows how it will look
          after saving.
        </p>
        <button
          type="button"
          aria-expanded={previewOpen}
          aria-controls={previewId}
          onClick={() => setPreviewOpen((open) => !open)}
          className="min-h-11 shrink-0 text-[0.8125rem] font-medium text-accent"
        >
          {previewOpen ? "Hide preview" : "Show preview"}
        </button>
      </div>

      {formatMessage && (
        <p role="status" aria-live="polite" className="px-1 text-[0.75rem] text-ash">
          {formatMessage}
        </p>
      )}

      {previewOpen && (
        <section
          id={previewId}
          aria-label="Entry preview"
          className="rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-3"
        >
          <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-accent">
            Preview
          </p>
          {value.trim() ? (
            <JournalEntryBody className="text-[0.9375rem] leading-relaxed text-charcoal">
              {value}
            </JournalEntryBody>
          ) : (
            <p className="text-[0.875rem] text-ash">
              Your formatted entry will appear here as you write.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function FormatButton({
  label,
  onPressStart,
  onClick,
  children,
}: {
  label: string;
  onPressStart: () => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        // Prevent touch and pen input from collapsing the textarea selection
        // before the captured range is formatted.
        event.preventDefault();
        onPressStart();
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full text-[1rem] text-ash transition-colors hover:bg-linen hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
