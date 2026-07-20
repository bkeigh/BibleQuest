"use client";

import type { RefObject } from "react";
import { cn } from "@/lib/utils/cn";

export function countJournalWords(value: string): number {
  const words = value.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu);
  return words?.length ?? 0;
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
  function restoreSelection(start: number, end: number) {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(start, end);
    });
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const field = textareaRef.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = value.slice(start, end);
    onChange(
      `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`,
    );
    restoreSelection(start + prefix.length, end + prefix.length);
  }

  function prefixLines(prefix: string) {
    const field = textareaRef.current;
    if (!field) return;
    const selectionStart = field.selectionStart;
    const selectionEnd = field.selectionEnd;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const nextBreak = value.indexOf("\n", selectionEnd);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const selectedLines = value.slice(lineStart, lineEnd).split("\n");
    const replacement = selectedLines.map((line) => `${prefix}${line}`).join("\n");
    onChange(`${value.slice(0, lineStart)}${replacement}${value.slice(lineEnd)}`);
    restoreSelection(
      selectionStart + prefix.length,
      selectionEnd + prefix.length * selectedLines.length,
    );
  }

  const wordCount = countJournalWords(value);

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className={cn("flex items-center justify-between gap-2", className)}
    >
      <div className="flex items-center gap-1">
        <FormatButton label="Bold" onClick={() => wrapSelection("**")}>
          <span className="font-semibold">B</span>
        </FormatButton>
        <FormatButton label="Italic" onClick={() => wrapSelection("*")}>
          <span className="italic">I</span>
        </FormatButton>
        <FormatButton label="Bulleted list" onClick={() => prefixLines("- ")}>
          <span aria-hidden>•</span>
        </FormatButton>
        <FormatButton label="Quote" onClick={() => prefixLines("> ")}>
          <span aria-hidden>“</span>
        </FormatButton>
      </div>
      <p className="shrink-0 text-[0.75rem] tabular-nums text-ash" aria-live="polite">
        {wordCount} {wordCount === 1 ? "word" : "words"}
      </p>
    </div>
  );
}

function FormatButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full text-[1rem] text-ash transition-colors hover:bg-linen hover:text-graphite focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    >
      {children}
    </button>
  );
}
