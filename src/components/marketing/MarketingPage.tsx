import { Eyebrow } from "@/components/design-system/EditorialSection";

/** Shared header + prose column for marketing content pages. */
export function MarketingPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-2xl px-5 pb-24 pt-32 sm:px-8">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="font-display text-heading text-graphite sm:text-heading-lg">
        {title}
      </h1>
      {intro && (
        <p className="mt-5 text-[1.125rem] leading-relaxed text-ash">{intro}</p>
      )}
      {children && (
        <div className="prose-quest mt-10 space-y-5 text-[1.0625rem] leading-relaxed text-charcoal">
          {children}
        </div>
      )}
    </article>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

export function ProseHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-4 font-display text-[1.5rem] text-graphite">{children}</h2>
  );
}
