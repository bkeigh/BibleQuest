/**
 * Shared framer-motion presets — the single source for in-app motion.
 *
 * Mirrors the CSS motion tokens in globals.css (`--ease-gentle`,
 * rise/settle keyframes) so JS-driven and CSS-driven motion feel identical.
 * House rules: calm and meaningful, never bouncy. Reduced motion is honored
 * automatically — `MotionConfig reducedMotion` (MotionProvider) covers these
 * presets, and the CSS kill-switches cover everything else.
 */
import type { Variants } from "framer-motion";

/**
 * The house easing curve — the framer mirror of CSS `--ease-gentle`
 * (`cubic-bezier(0.25, 0.4, 0.25, 1)`). Use for every transition unless a
 * preset already applies it.
 */
export const gentleEase: [number, number, number, number] = [0.25, 0.4, 0.25, 1];

/**
 * Gentle rise-in: fade + 10px rise over ~0.5s. The default entrance for
 * cards, sections, and anything appearing in place.
 *
 * Usage: `<motion.div variants={riseIn} initial="hidden" animate="visible">`
 */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: gentleEase },
  },
};

/**
 * Height/opacity expander for disclosure-style content (inline confirms,
 * "mark as answered" notes, expanding rows). Pair with `overflow-hidden`
 * on the same element and `AnimatePresence` for exit:
 *
 * `<motion.div variants={expander} initial="hidden" animate="visible" exit="hidden" className="overflow-hidden">`
 *
 * (The design-system `Disclosure` component uses a CSS grid technique
 * instead — reach for this preset only for one-off inline expanders.)
 */
export const expander: Variants = {
  hidden: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.3, ease: gentleEase },
  },
  visible: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.35, ease: gentleEase },
  },
};

/**
 * Onboarding / wizard step transition: quiet fade with a small lateral
 * slide. Use with `AnimatePresence mode="wait"`:
 *
 * `<motion.div key={step} variants={stepTransition} initial="enter" animate="center" exit="exit">`
 */
export const stepTransition: Variants = {
  enter: { opacity: 0, x: 16 },
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: gentleEase },
  },
  exit: {
    opacity: 0,
    x: -16,
    transition: { duration: 0.25, ease: gentleEase },
  },
};

/**
 * Quest-complete / milestone reveal: a subtle scale from 0.96 to 1 with a
 * fade. Deliberately NOT bouncy — celebration in this app is warm and
 * settled, never confetti.
 */
export const celebrationScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: gentleEase },
  },
};

/**
 * Blessing sparkle: a small opacity shimmer for achievement moments.
 * Pass an index via `custom` to
 * stagger a cluster:
 *
 * `<motion.span variants={blessingSparkle} initial="hidden" animate="visible" custom={i}>`
 *
 * Gentle timing keeps the acknowledgement quiet rather than celebratory noise.
 */
export const blessingSparkle: Variants = {
  hidden: { opacity: 0 },
  visible: (i: number = 0) => ({
    opacity: [0, 1, 0.55, 1],
    transition: {
      duration: 0.4,
      delay: i * 0.07,
      times: [0, 0.35, 0.65, 1],
      ease: "easeInOut",
    },
  }),
};
