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

const PADDING: Record<PaperPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
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
      className={cn(
        "rounded-[var(--radius-card)]",
        VARIANTS[variant],
        PADDING[padding],
        interactive &&
          "transition-shadow transition-colors duration-300 [transition-timing-function:var(--ease-gentle)] hover:paper-shadow-lg hover:border-olive-300/60",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
