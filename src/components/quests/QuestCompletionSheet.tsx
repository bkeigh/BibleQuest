"use client";

/**
 * Dismissible post-completion moment. Completion has already been recorded,
 * so reflection stays genuinely optional and never blocks returning to board.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { QuestTemplate, ReflectionMood } from "@/lib/questos/types";
import { useQuestOS } from "@/lib/questos/store";
import { MoodPicker } from "@/components/reflection/MoodPicker";
import { GentleButton } from "@/components/design-system/GentleButton";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { IconClose } from "@/components/design-system/icons";

interface QuestCompletionSheetProps {
  quest: QuestTemplate | null;
  onClose: () => void;
}

export function QuestCompletionSheet({
  quest,
  onClose,
}: QuestCompletionSheetProps) {
  const addReflection = useQuestOS((state) => state.addReflection);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reflectionId = useId();
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<ReflectionMood | undefined>();
  const [saved, setSaved] = useState(false);

  /** Clears the optional form before handing control back to the board. */
  const closeSheet = useCallback(() => {
    setComposing(false);
    setBody("");
    setMood(undefined);
    setSaved(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!quest) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const node = dialogRef.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'button, textarea, [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [quest, closeSheet]);

  if (!quest) return null;
  const activeQuest = quest;

  /** Saves text, mood, or both as a quest-linked reflection. */
  function saveReflection() {
    if (!body.trim() && !mood) return;
    addReflection({
      body,
      mood,
      prompt: activeQuest.reflectionPrompt,
      relatedQuestSlug: activeQuest.slug,
    });
    setSaved(true);
    setComposing(false);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end bg-dusk/25 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeSheet();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[var(--radius-card-lg)] border border-mist bg-paper p-5 paper-shadow-lg sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-surface ring-1 ring-accent/20">
              <ArtIcon name="star" size={68} />
            </span>
            <div className="min-w-0">
              <p className="text-caption uppercase tracking-[0.14em] text-accent">
                Quest complete
              </p>
              <h2
                id={titleId}
                className="mt-1 font-display text-subheading text-graphite"
              >
                {activeQuest.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Close quest completion"
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ash transition-colors hover:bg-linen hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <IconClose size={19} />
          </button>
        </div>

        <p className="mt-4 text-small leading-relaxed text-ash">
          Your progress is saved. Add a reflection if something stood out.
        </p>

        {saved ? (
          <p
            role="status"
            className="mt-4 rounded-[var(--radius-button)] bg-accent-surface px-4 py-3 text-small text-accent"
          >
            Reflection saved.
          </p>
        ) : composing ? (
          <div className="mt-4">
            <label
              htmlFor={reflectionId}
              className="block text-small font-medium text-graphite"
            >
              {activeQuest.reflectionPrompt}
            </label>
            <textarea
              id={reflectionId}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              placeholder="Write freely, or choose only a feeling…"
              className="mt-3 w-full resize-y rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-3 text-[1rem] leading-relaxed text-graphite outline-none transition-colors focus:border-accent/50"
            />
            <div className="mt-3">
              <MoodPicker value={mood} onChange={setMood} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <GentleButton
                variant="primary"
                size="sm"
                disabled={!body.trim() && !mood}
                onClick={saveReflection}
              >
                Save reflection
              </GentleButton>
              <GentleButton
                variant="ghost"
                size="sm"
                onClick={() => setComposing(false)}
              >
                Not now
              </GentleButton>
            </div>
          </div>
        ) : (
          <GentleButton
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setComposing(true)}
          >
            Add reflection
          </GentleButton>
        )}

        <GentleButton
          variant="primary"
          size="md"
          fullWidth
          className="mt-5"
          onClick={closeSheet}
        >
          Done
        </GentleButton>
      </div>
    </div>,
    document.body,
  );
}
