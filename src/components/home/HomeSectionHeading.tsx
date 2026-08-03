import type { ReactNode } from "react";

interface HomeSectionHeadingProps {
  id: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}

/** Keeps every Home category label on the same visual baseline and content grid. */
export function HomeSectionHeading({
  id,
  title,
  subtitle,
  action,
}: HomeSectionHeadingProps) {
  return (
    <div className="mb-3 grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id={id}
          className="font-art-label text-[1.75rem] uppercase leading-none tracking-[0.05em] text-accent min-[390px]:text-[2.125rem]"
        >
          {title}
        </h2>
        <p className="text-[0.625rem] uppercase tracking-[0.08em] text-ash sm:text-caption sm:tracking-[0.12em]">
          {subtitle}
        </p>
      </div>
      {action}
    </div>
  );
}
