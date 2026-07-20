import { cn } from "@/lib/utils/cn";

interface EditorialSectionProps {
  children: React.ReactNode;
  className?: string;
  /** Vertical rhythm for landing/marketing sections. */
  spacing?: "compact" | "normal" | "loose" | "atmospheric";
  id?: string;
}

const SPACING = {
  compact: "py-12 sm:py-16",
  normal: "py-16 sm:py-20",
  loose: "py-20 sm:py-28",
  atmospheric: "py-24 sm:py-36",
};

export function EditorialSection({
  children,
  className,
  spacing = "normal",
  id,
}: EditorialSectionProps) {
  return (
    <section id={id} className={cn(SPACING[spacing], className)}>
      <div className="mx-auto w-full max-w-5xl px-5 sm:px-8">{children}</div>
    </section>
  );
}

/** A quiet, centered eyebrow label above editorial headings. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-[0.8125rem] font-medium uppercase tracking-[0.18em] text-accent">
      {children}
    </p>
  );
}
