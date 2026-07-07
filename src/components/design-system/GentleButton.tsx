import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type Variant = "outline" | "dark" | "ghost" | "text" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius-button)] " +
  "transition-all duration-300 [transition-timing-function:var(--ease-gentle)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive-500 " +
  "disabled:opacity-50 disabled:pointer-events-none select-none";

const VARIANTS: Record<Variant, string> = {
  outline:
    "border border-olive-500/70 text-olive-700 bg-transparent hover:bg-olive-50 active:bg-olive-100",
  dark: "bg-dusk text-parchment border border-dusk hover:bg-twilight active:opacity-90",
  gold: "bg-gold-100 text-gold-700 border border-gold-300 hover:bg-gold-300/40",
  ghost: "text-charcoal hover:bg-linen active:bg-mist/50",
  text: "text-olive-700 hover:text-olive-500 underline-offset-4 hover:underline px-0",
  danger:
    "border border-rose-300 text-rose-700 bg-transparent hover:bg-rose-50 active:bg-rose-100",
};

const SIZES: Record<Size, string> = {
  sm: "text-[0.9375rem] px-3.5 py-2",
  md: "text-[1rem] px-5 py-2.5",
  lg: "text-[1.0625rem] px-6 py-3",
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
        variant !== "text" && SIZES[size],
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
        variant !== "text" && SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
