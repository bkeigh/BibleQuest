import { cn } from "@/lib/utils/cn";

type PaperVariant = "paper" | "linen" | "atmospheric" | "outlined" | "quiet";
type PaperPadding = "none" | "sm" | "md" | "lg";

const VARIANTS: Record<PaperVariant, string> = {
  paper: "bg-paper border border-mist paper-shadow",
  linen: "bg-linen border border-mist",
  atmospheric: "bg-linen border border-mist paper-grain paper-shadow",
  outlined: "bg-transparent border border-mist",
  quiet: "bg-paper/60 border border-mist/70",
};

/** Keeps phone cards compact while restoring generous spacing on larger screens. */
const PADDING: Record<PaperPadding, string> = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-7",
};

interface PaperCardProps extends React.HTMLAttributes<HTMLElement> {
  variant?: PaperVariant;
  padding?: PaperPadding;
  as?: "div" | "article" | "section" | "li";
  interactive?: boolean;
}

export function PaperCard({
  variant = "paper",
  padding = "md",
  as: Tag = "div",
  interactive = false,
  className,
  children,
  ...rest
}: PaperCardProps) {
  return (
    <Tag
      data-paper-variant={variant}
      className={cn(
        "app-glass-surface rounded-[var(--radius-card)]",
        VARIANTS[variant],
        PADDING[padding],
        interactive &&
          "transition-[transform,box-shadow,border-color,background-color] duration-300 [transition-timing-function:var(--ease-gentle)] hover:-translate-y-0.5 hover:paper-shadow-lg hover:border-olive-300/60 active:translate-y-px motion-reduce:transform-none",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
