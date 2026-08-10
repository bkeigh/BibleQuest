import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type Variant =
  | "primary"
  | "outline"
  | "apple"
  | "google"
  | "dark"
  | "ghost"
  | "text"
  | "danger"
  | "gold";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius-button)] " +
  "transition-all duration-300 [transition-timing-function:var(--ease-gentle)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "active:translate-y-px motion-reduce:transform-none disabled:translate-y-0 " +
  "disabled:opacity-50 disabled:pointer-events-none select-none";

const VARIANTS: Record<Variant, string> = {
  /** THE main CTA — deep evergreen fill, warm ivory text. */
  primary:
    "bg-evergreen-700 text-[#fdfbf3] border border-evergreen-700 " +
    "shadow-[0_8px_20px_rgb(14_83_60_/_0.16)] hover:bg-evergreen-600 hover:border-evergreen-600 hover:shadow-[0_10px_24px_rgb(14_83_60_/_0.22)] " +
    "active:bg-evergreen-800 active:border-evergreen-800",
  outline:
    "border border-accent/60 text-accent bg-transparent hover:bg-accent-surface active:bg-accent-surface",
  /** Provider fills stay brand-recognizable while sharing our touch geometry. */
  apple:
    "border border-black bg-black text-white hover:border-[#1d1d1f] hover:bg-[#1d1d1f] active:bg-[#2c2c2e]",
  google:
    "border border-[#1a73e8] bg-[#1a73e8] text-white hover:border-[#1765cc] hover:bg-[#1765cc] active:bg-[#1558b0]",
  /* Secondary dark fill — dusk is green-black; moon-paper text stays light
     in both themes (parchment flips dark in candle mode). */
  dark: "bg-dusk text-moon-paper border border-dusk hover:bg-twilight active:opacity-90",
  /* Quiet gold chip. Translucent gold-500 resolves to the gold-100/gold-300
     look on parchment and to a candlelit tint in dark mode, where text-gilt
     flips light — an opaque gold-100 fill would trap light gilt on a light
     chip. */
  gold: "bg-gold-500/15 text-gilt border border-gold-500/45 hover:bg-gold-500/25 active:bg-gold-500/30",
  ghost: "text-charcoal hover:bg-linen active:bg-mist/50",
  text: "text-accent hover:text-accent/80 underline-offset-4 hover:underline px-0",
  danger:
    "border border-rose-300 text-rose-700 bg-transparent hover:bg-rose-50 active:bg-rose-100",
};

/** Filled and outlined controls keep a full mobile touch target at every size. */
const SIZES: Record<Size, string> = {
  sm: "min-h-11 text-[0.9375rem] px-3.5 py-2",
  md: "min-h-11 text-[1rem] px-5 py-2.5",
  lg: "min-h-11 text-[1.0625rem] px-6 py-3",
};

/** Text buttons drop horizontal padding but retain a 44px touch target. */
const TEXT_SIZES: Record<Size, string> = {
  sm: "min-h-11 text-[0.9375rem]",
  md: "min-h-11 text-[1rem]",
  lg: "min-h-11 text-[1.0625rem]",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
}

type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

export function GentleButton({
  variant = "outline",
  size = "md",
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        BASE,
        VARIANTS[variant],
        variant === "text" ? TEXT_SIZES[size] : SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

type LinkButtonProps = CommonProps &
  Omit<React.ComponentProps<typeof Link>, "className" | "children">;

export function GentleLink({
  variant = "outline",
  size = "md",
  fullWidth,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      className={cn(
        BASE,
        VARIANTS[variant],
        variant === "text" ? TEXT_SIZES[size] : SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
