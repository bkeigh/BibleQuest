"use client";

import { guidedScriptureForDate } from "@/data/guided/content";
import { makeGuidedSessionKey } from "@/lib/guided/progress";
import { toDateKey } from "@/lib/utils/dates";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { GuidedPracticeRunner } from "./GuidedPracticeRunner";

/** Resolves the local day only after hydration so midnight and time zones agree. */
function DailyGuidedPracticeInner() {
  const dateKey = toDateKey();
  const practice = guidedScriptureForDate(dateKey);
  return (
    <GuidedPracticeRunner
      practice={practice}
      sessionKey={makeGuidedSessionKey("daily", practice.id, dateKey)}
      kind="daily"
      backHref="/app/guided"
      backLabel="Guided Scripture"
      contextLabel="Today’s guide"
    />
  );
}

export function DailyGuidedPractice() {
  return (
    <ClientOnly>
      <DailyGuidedPracticeInner />
    </ClientOnly>
  );
}
