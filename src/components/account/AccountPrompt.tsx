"use client";

/**
 * AccountPrompt — a gentle, contextual invitation to create an account.
 *
 * House rules:
 *  - Inline card, never a modal. It sits in the page and can be ignored.
 *  - Each high-intent context earns at most ONE appearance, ever
 *    (first quest completed, first reflection, first milestone, finishing
 *    onboarding) — tracked device-locally in the store's accountNudge.
 *  - "Maybe later" starts a two-week quiet period; after three dismissals
 *    we stop asking altogether. Settings keeps a permanent entry point.
 *  - Never shown while signed in, while auth is loading, or when Supabase
 *    isn't configured for this deployment.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuestOS, selectAccountNudge } from "@/lib/questos/store";
import type { AccountNudgeContext } from "@/lib/questos/types";
import { useSession } from "@/lib/supabase/useSession";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { useStrings } from "@/lib/i18n";
import { track } from "@/lib/analytics/events";
import { accountSyncAvailable } from "@/lib/sync/containment";

const QUIET_PERIOD_DAYS = 14;
const MAX_DISMISSALS = 3;

/** High-intent first, so the invitation lands when it means the most. */
const CONTEXT_PRIORITY: AccountNudgeContext[] = [
  "first_quest_completed",
  "first_reflection",
  "milestone_reached",
  "onboarding",
];

function useEligibleContext(): AccountNudgeContext | null {
  const nudge = useQuestOS(selectAccountNudge);
  const completions = useQuestOS((s) => s.completions);
  const reflections = useQuestOS((s) => s.reflections);
  const earnedMilestones = useQuestOS((s) => s.earnedMilestones);
  const onboarded = useQuestOS(
    (s) => s.profile?.onboardingCompleted ?? false
  );

  return useMemo(() => {
    if (nudge.dismissCount >= MAX_DISMISSALS) return null;
    if (nudge.lastDismissedAt) {
      const quietUntil = new Date(nudge.lastDismissedAt);
      quietUntil.setDate(quietUntil.getDate() + QUIET_PERIOD_DAYS);
      if (new Date() < quietUntil) return null;
    }
    const reached: Record<AccountNudgeContext, boolean> = {
      first_quest_completed: completions.length > 0,
      first_reflection: reflections.length > 0,
      milestone_reached: earnedMilestones.length > 0,
      onboarding: onboarded,
    };
    return (
      CONTEXT_PRIORITY.find(
        (c) => reached[c] && !nudge.shownContexts.includes(c)
      ) ?? null
    );
  }, [nudge, completions.length, reflections.length, earnedMilestones.length, onboarded]);
}

export function AccountPrompt() {
  const t = useStrings();
  const { user, loading, configured } = useSession();
  const eligible = useEligibleContext();
  const markShown = useQuestOS((s) => s.markAccountNudgeShown);
  const dismiss = useQuestOS((s) => s.dismissAccountNudge);

  const [hidden, setHidden] = useState(false);
  const viewedRef = useRef(false);
  const promptRef = useRef<HTMLDivElement>(null);

  // Latch the context once at mount so the card doesn't vanish mid-visit
  // the moment markAccountNudgeShown consumes its eligibility. Each Home
  // visit remounts this component, so the latch is per-visit by design.
  const [context] = useState<AccountNudgeContext | null>(() => eligible);

  // A configured provider is not an invitation while the release latch keeps
  // account sync contained; hide the CTA instead of sending people to a stop.
  const show = accountSyncAvailable(configured) && !loading && !user && !hidden;

  // Count a view only after the card enters the viewport. This also prevents
  // content inside a closed disclosure from consuming its one-time prompt.
  useEffect(() => {
    const prompt = promptRef.current;
    if (!show || !context || viewedRef.current || !prompt) return;

    const recordView = () => {
      if (viewedRef.current) return;
      viewedRef.current = true;
      markShown(context);
      track("account_prompt_viewed", { context });
    };

    if (!("IntersectionObserver" in window)) {
      recordView();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        recordView();
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(prompt);
    return () => observer.disconnect();
  }, [show, context, markShown]);

  if (!show || !context) return null;

  return (
    <div ref={promptRef}>
      <PaperCard variant="linen" padding="md" role="note" aria-label={t.accountPrompt.title}>
        <div className="flex items-start gap-3.5">
          <span className="shrink-0">
            <ArtIcon name="lantern" size={56} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-subheading text-graphite">
              {t.accountPrompt.title}
            </h3>
            <p className="mt-1 text-small leading-relaxed text-charcoal">
              {t.accountPrompt.body}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <GentleLink
                variant="primary"
                size="sm"
                href="/app/account"
                onClick={() => track("account_prompt_accepted", { context })}
              >
                {t.accountPrompt.cta}
              </GentleLink>
              <GentleButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  dismiss();
                  setHidden(true);
                  track("account_prompt_dismissed", { context });
                }}
              >
                {t.accountPrompt.dismiss}
              </GentleButton>
            </div>
          </div>
        </div>
      </PaperCard>
    </div>
  );
}
