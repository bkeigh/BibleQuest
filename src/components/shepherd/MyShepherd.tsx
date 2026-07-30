"use client";

import { useState } from "react";
import {
  MY_SHEPHERD_MAX_QUESTION_LENGTH,
  type MyShepherdAnswer,
} from "@/lib/ai/contracts";
import { apiFetch } from "@/lib/platform/api";
import { usePlus } from "@/lib/billing/usePlus";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PlusFeatureDialog } from "@/components/plus/PlusFeatureDialog";

const STARTERS = [
  "What does grace mean in the Bible?",
  "Where can I read about forgiveness?",
  "How can I pray when I feel distracted?",
  "How do Christians understand hope?",
] as const;

function errorMessage(status: number): string {
  if (status === 401) return "Sign in again so BibleQuest can verify your account.";
  if (status === 403) return "MyShepherd is included with BibleQuest Plus.";
  if (status === 429) return "MyShepherd needs a short rest. Please try again later.";
  return "MyShepherd couldn’t answer just now. No credits were used for a failed request.";
}

/** One-question study companion with no transcript or journal persistence. */
export function MyShepherd() {
  const plus = usePlus();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<MyShepherdAnswer | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plusDialogOpen, setPlusDialogOpen] = useState(false);

  async function ask() {
    const trimmed = question.trim();
    if (trimmed.length < 3 || working) return;
    setWorking(true);
    setError(null);
    try {
      const response = await apiFetch("/api/ai/shepherd", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!response.ok) {
        setError(errorMessage(response.status));
        return;
      }
      setAnswer((await response.json()) as MyShepherdAnswer);
    } catch {
      setError(errorMessage(503));
    } finally {
      setWorking(false);
    }
  }

  if (plus.loading) {
    return (
      <PaperCard variant="quiet" padding="lg" aria-busy>
        <p className="text-body text-ash">Checking Plus access…</p>
      </PaperCard>
    );
  }

  if (!plus.isPlus) {
    return (
      <>
        <PaperCard variant="quiet" padding="lg">
          <span className="rounded-full bg-gold-500/15 px-2.5 py-1 text-caption font-medium text-gilt">
            Plus
          </span>
          <h2 className="mt-4 font-display text-subheading text-graphite">
            A patient Scripture study companion
          </h2>
          <p className="mt-2 text-body leading-relaxed text-charcoal">
            Ask one faith or Bible question at a time. MyShepherd gives a
            humble explanation, passages to open, and one gentle next step.
          </p>
          <GentleButton
            variant="primary"
            className="mt-5"
            onClick={() => setPlusDialogOpen(true)}
          >
            Explore Plus
          </GentleButton>
        </PaperCard>
        <PlusFeatureDialog
          open={plusDialogOpen}
          onClose={() => setPlusDialogOpen(false)}
          title="Ask MyShepherd"
          description="MyShepherd’s bounded AI study companion is included with BibleQuest Plus."
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PaperCard as="section" variant="paper" padding="lg">
        <p className="text-small leading-relaxed text-ash">
          Ask about Scripture or Christian practice. Do not paste private
          prayers, journal entries, names, or identifying details.
        </p>
        <label
          htmlFor="my-shepherd-question"
          className="mt-5 block text-small font-medium text-charcoal"
        >
          What would you like to understand?
        </label>
        <textarea
          id="my-shepherd-question"
          rows={5}
          maxLength={MY_SHEPHERD_MAX_QUESTION_LENGTH}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Example: What does grace mean in the Bible?"
          className="mt-2 w-full resize-y rounded-[var(--radius-card)] border border-mist bg-linen px-4 py-3 text-body leading-relaxed text-graphite outline-none focus:border-accent/50"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-caption text-ash">
            This question is not saved by BibleQuest.
          </p>
          <p className="shrink-0 text-caption text-ash">
            {question.length}/{MY_SHEPHERD_MAX_QUESTION_LENGTH}
          </p>
        </div>
        <GentleButton
          variant="primary"
          fullWidth
          className="mt-4"
          disabled={working || question.trim().length < 3}
          onClick={ask}
          aria-busy={working}
        >
          {working ? "Thinking gently…" : "Ask MyShepherd"}
        </GentleButton>
        {error && (
          <p role="alert" className="mt-3 text-small text-rose-700">
            {error}
          </p>
        )}
      </PaperCard>

      {!answer && (
        <PaperCard as="section" variant="quiet" padding="md">
          <h2 className="font-display text-[1.125rem] text-graphite">
            Simple places to begin
          </h2>
          <div className="mt-3 grid gap-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => {
                  setQuestion(starter);
                  setError(null);
                }}
                className="min-h-11 rounded-[var(--radius-button)] border border-mist bg-paper px-3 py-2.5 text-left text-small text-charcoal hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {starter}
              </button>
            ))}
          </div>
        </PaperCard>
      )}

      {answer && (
        <PaperCard as="section" variant="paper" padding="lg" aria-live="polite">
          <p className="text-caption font-medium uppercase tracking-[0.08em] text-accent">
            Study companion response
          </p>
          <div className="mt-3 space-y-3 text-body leading-relaxed text-charcoal">
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
                {answer.scriptureReferences.map((reference) => (
                  <li
                    key={reference}
                    className="rounded-full bg-accent-surface px-3 py-1.5 text-caption text-accent-ink"
                  >
                    {reference}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 rounded-[var(--radius-button)] bg-linen px-4 py-3">
            <p className="text-caption font-medium text-accent">A next step</p>
            <p className="mt-1 text-small leading-relaxed text-charcoal">
              {answer.nextStep}
            </p>
          </div>
          {answer.safetyNote && (
            <p className="mt-4 text-small leading-relaxed text-ash">
              {answer.safetyNote}
            </p>
          )}
        </PaperCard>
      )}

      <p className="px-2 text-caption leading-relaxed text-ash">
        MyShepherd uses AI. Its responses are not Scripture and may be wrong.
        It is not clergy, therapy, crisis support, medical care, or legal
        advice. For serious concerns, speak with trusted people and qualified
        help.
      </p>
    </div>
  );
}
