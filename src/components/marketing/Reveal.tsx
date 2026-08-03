"use client";

import { motion } from "framer-motion";
import { gentleEase } from "@/lib/motion";

/**
 * Gentle in-view reveal for scrollytelling sections. Reduced-motion safe:
 * the marketing layout wraps everything in `MotionConfig reducedMotion="user"`.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  immediate = false,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  immediate?: boolean;
}) {
  return (
    <motion.div
      className={className}
      initial={immediate ? false : { opacity: 0, y: 18 }}
      animate={immediate ? { opacity: 1, y: 0 } : undefined}
      whileInView={immediate ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: gentleEase }}
    >
      {children}
    </motion.div>
  );
}
