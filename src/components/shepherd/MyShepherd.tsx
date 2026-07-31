"use client";

import { useState } from "react";
import {
  MY_SHEPHERD_MAX_QUESTION_LENGTH,
  type MyShepherdAnswer,
} from "@/lib/ai/contracts";
import { apiFetch } from "@/lib/platform/api";
import { usePlus } from "@/lib/billing/usePlus";
import { GentleButton } from "@/components/design-system/GentleButton";
import { InfoHint } from "@/components/design-system/InfoHint";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PlusFeatureDialog } from "@/components/plus/PlusFeatureDialog";
import { MyShepherdResponse } from "@/components/shepherd/MyShepherdResponse";

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
  // Deliberately no mention of credits: BibleQuest has no credit or quota
  // concept, so reassuring the reader about one only raises the question.
  return "MyShepherd couldn’t answer just now. Please try again in a moment.";
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
        body: JSON.stringify({
          question: trimmed,
          currentPath: window.location.pathname,
        }),
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
        <label
          htmlFor="my-shepherd-question"
          className="block text-small font-medium text-charcoal"
        >
          What would you like to understand?
        </label>
        <textarea
          id="my-shepherd-question"
          rows={4}
          maxLength={MY_SHEPHERD_MAX_QUESTION_LENGTH}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Example: What does grace mean in the Bible?"
          className="mt-2 w-full resize-y rounded-[var(--radius-card)] border border-mist bg-linen px-4 py-3 text-body leading-relaxed text-graphite outline-none focus:border-accent/50"
        />

        {/* Starters sit with the field they fill, and step aside once the
            reader has words of their own. */}
        {!question.trim() && (
          <div className="mt-3">
            <p className="text-caption text-ash">Or start with one of these</p>
            <div className="mt-2 grid gap-2">
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
          </div>
        )}

        <div className="mt-3 flex items-start justify-between gap-3">
          <InfoHint label="How your question is handled">
            Ask about Scripture or Christian practice. Your question is sent to
            be answered but is not saved by BibleQuest, and no reply is kept.
            Please leave out private prayers, journal entries, names, and other
            identifying details.
          </InfoHint>
          {question.length > MY_SHEPHERD_MAX_QUESTION_LENGTH - 80 && (
            <p className="shrink-0 pt-2 text-caption text-ash">
              {question.length}/{MY_SHEPHERD_MAX_QUESTION_LENGTH}
            </p>
          )}
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

      {answer && (
        <PaperCard as="section" variant="paper" padding="lg" aria-live="polite">
          <MyShepherdResponse answer={answer} />
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
