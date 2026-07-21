"use client";

/**
 * Minimal, calm toast system. Gentle save/complete confirmations — the
 * "celebrate" variant marks quest-complete moments with a quiet gold edge,
 * never celebratory noise.
 *
 * Auto-dismisses after 5s; the timer pauses while hovered or focused.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { gentleEase } from "@/lib/motion";
import { PixelIcon } from "./PixelIcon";

type ToastVariant = "default" | "success" | "celebrate";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  variant?: ToastVariant;
  /** Optional inline action, e.g. an undo button. Dismisses the toast on use. */
  action?: ToastAction;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

const AUTO_DISMISS_MS = 5000;

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: "rounded-full border border-mist",
  success:
    "rounded-[var(--radius-card)] border border-mist border-l-[3px] border-l-accent",
  celebrate:
    "rounded-[var(--radius-card)] border border-mist border-l-[3px] border-l-gold-500",
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const timer = setTimeout(onDismiss, remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current)
      );
    };
  }, [paused, onDismiss]);

  const variant = item.variant ?? "default";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.35, ease: gentleEase }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      className={cn(
        "pointer-events-auto flex items-center gap-3 bg-paper px-5 py-2.5 text-[0.9375rem] text-graphite paper-shadow-lg",
        VARIANT_STYLES[variant]
      )}
    >
      {variant === "celebrate" && (
        <PixelIcon name="star" size={3} animate className="shrink-0" />
      )}
      <span>{item.message}</span>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1 font-medium text-accent underline-offset-4 hover:underline"
        >
          {item.action.label}
        </button>
      )}
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, options?: ToastOptions) => {
    const id = ++counter;
    setItems((prev) => [...prev, { id, message, ...options }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-8"
      >
        <AnimatePresence>
          {items.map((t) => (
            <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: () => {} };
  return ctx;
}
