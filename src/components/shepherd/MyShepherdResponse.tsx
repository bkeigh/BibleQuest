"use client";

import Link from "next/link";
import type { MyShepherdAnswer } from "@/lib/ai/contracts";
import {
  myShepherdActionHref,
  myShepherdReferenceHref,
} from "@/lib/ai/myshepherd-navigation";
import { IconArrowRight } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";

interface MyShepherdResponseProps {
  answer: MyShepherdAnswer;
  compact?: boolean;
  onNavigate?: () => void;
}

/** Renders answers with safe internal links for Scripture and app destinations. */
export function MyShepherdResponse({
  answer,
  compact = false,
  onNavigate,
}: MyShepherdResponseProps) {
  return (
    <div aria-live="polite">
      <p className="text-caption font-medium uppercase tracking-[0.08em] text-accent">
        Study companion response
      </p>
      <div
        className={cn(
          "mt-3 space-y-3 leading-relaxed text-charcoal",
          compact ? "text-small" : "text-body",
        )}
      >
        {answer.answer
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
      </div>
      {answer.scriptureReferences.length > 0 && (
        <div className="mt-5">
          <h2 className="text-small font-medium text-graphite">
            Passages to open
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {answer.scriptureReferences.map((reference) => {
              const href = myShepherdReferenceHref(reference);
              return (
                <li key={reference}>
                  {href ? (
                    <Link
                      href={href}
                      onClick={onNavigate}
                      className="inline-flex min-h-9 items-center rounded-full bg-accent-surface px-3 py-1.5 text-caption font-medium text-accent-ink hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {reference}
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-9 items-center rounded-full bg-accent-surface px-3 py-1.5 text-caption text-accent-ink">
                      {reference}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="mt-5 rounded-[var(--radius-button)] bg-linen px-4 py-3">
        <p className="text-caption font-medium text-accent">A next step</p>
        <p className="mt-1 text-small leading-relaxed text-charcoal">
          {answer.nextStep}
        </p>
      </div>
      {answer.appAction && (
        <Link
          href={myShepherdActionHref(answer.appAction)}
          onClick={onNavigate}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-accent px-4 py-2.5 text-small font-medium text-paper hover:bg-evergreen-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {answer.appAction.label}
          <IconArrowRight size={15} />
        </Link>
      )}
      {answer.safetyNote && (
        <p className="mt-4 text-small leading-relaxed text-ash">
          {answer.safetyNote}
        </p>
      )}
    </div>
  );
}
