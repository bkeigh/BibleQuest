"use client";

/**
 * Keeps account enrollment and returning-user access visibly distinct.
 * The same choice appears in onboarding and the Account screen so people do
 * not have to reinterpret two different authentication interfaces.
 */
import type { AccountIntent } from "@/lib/auth/account-intent";
import { cn } from "@/lib/utils/cn";

const OPTIONS: ReadonlyArray<{
  intent: AccountIntent;
  context: string;
  action: string;
}> = [
  { intent: "create", context: "New to BibleQuest?", action: "Create account" },
  { intent: "signin", context: "Already have an account?", action: "Sign in" },
];

export function AccountIntentPicker({
  intent,
  onIntentChange,
  className,
}: {
  intent: AccountIntent;
  onIntentChange: (intent: AccountIntent) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Choose account access"
      className={cn(
        "grid grid-cols-2 gap-2 rounded-[var(--radius-button)] bg-linen p-1",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const selected = intent === option.intent;
        return (
          <button
            key={option.intent}
            type="button"
            aria-pressed={selected}
            onClick={() => onIntentChange(option.intent)}
            className={cn(
              "min-h-[3.625rem] rounded-[calc(var(--radius-button)-0.25rem)] px-2.5 py-2 text-center transition-colors",
              selected
                ? "bg-paper text-accent shadow-sm ring-1 ring-mist/70"
                : "text-ash hover:bg-paper/45 hover:text-charcoal",
            )}
          >
            <span className="block text-[0.6875rem] leading-tight">
              {option.context}
            </span>
            <span className="mt-1 block text-small font-medium leading-tight">
              {option.action}
            </span>
          </button>
        );
      })}
    </div>
  );
}
