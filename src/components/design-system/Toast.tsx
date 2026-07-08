"use client";

/**
 * Minimal, calm toast system. Gentle save/complete confirmations only —
 * never celebratory noise.
 */
import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ToastItem {
  id: number;
  message: string;
}

interface ToastContextValue {
  toast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string) => {
    const id = ++counter;
    setItems((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-8"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.25, 0.4, 0.25, 1] }}
              className="pointer-events-auto rounded-full border border-mist bg-paper px-5 py-2.5 text-[0.9375rem] text-graphite paper-shadow-lg"
            >
              {t.message}
            </motion.div>
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
