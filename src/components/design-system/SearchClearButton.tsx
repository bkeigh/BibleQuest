"use client";

/** A consistent touch-sized clear action that returns focus to its search box. */
import { IconClose } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

interface SearchClearButtonProps {
  inputId: string;
  visible: boolean;
  onClear: () => void;
  label?: string;
  className?: string;
}

export function SearchClearButton({
  inputId,
  visible,
  onClear,
  label = "Clear search",
  className,
}: SearchClearButtonProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        onClear();
        window.requestAnimationFrame(() =>
          document.getElementById(inputId)?.focus(),
        );
      }}
      className={cn(
        "absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ash transition-colors hover:bg-linen hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <IconClose size={16} />
    </button>
  );
}
