"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { MoodPicker } from "@/components/reflection/MoodPicker";
import { JournalEditorToolbar } from "@/components/journal/JournalEditorToolbar";
import { JournalPrivacyBoundary } from "@/components/journal/JournalPrivacyBoundary";
import { IconArrowLeft } from "@/components/design-system/icons";
import { reflectionPrompts } from "@/data/seed/reflection-prompts";
import { hashString, toDateKey } from "@/lib/utils/dates";
import { useDeviceLocalJournalDraft } from "@/lib/questos/journal-drafts";
import type { ReflectionMood } from "@/lib/questos/types";

type ReflectionDraft = {
  body: string;
  mood: ReflectionMood | "";
  prompt: string;
};

const reflectionDraftIsEmpty = (draft: ReflectionDraft) => !draft.body.trim();

function ReflectionComposerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const addReflection = useQuestOS((state) => state.addReflection);
  const updateReflection = useQuestOS((state) => state.updateReflection);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editId = params.get("edit") ?? undefined;
  const existing = useQuestOS((state) =>
    editId
      ? state.reflections.find((reflection) => reflection.id === editId)
      : undefined,
  );
  const isEdit = Boolean(existing);
  const verseRef = existing?.relatedVerseReference ?? params.get("verse") ?? undefined;

  const promptPool = useMemo(() => {
    if (!verseRef) return reflectionPrompts;
    const scripturePrompts = reflectionPrompts.filter(
      (prompt) => prompt.context === "after_scripture",
    );
    return scripturePrompts.length ? scripturePrompts : reflectionPrompts;
  }, [verseRef]);
  const requestedPrompt = useMemo(() => {
    const id = params.get("prompt");
    return id ? promptPool.find((prompt) => prompt.id === id) : undefined;
  }, [params, promptPool]);
  const dailyPromptIndex = useMemo(
    () => hashString(toDateKey() + (verseRef ?? "")) % promptPool.length,
    [promptPool.length, verseRef],
  );
  const [promptIndex, setPromptIndex] = useState(() =>
    requestedPrompt
      ? Math.max(
          0,
          promptPool.findIndex((prompt) => prompt.id === requestedPrompt.id),
        )
      : dailyPromptIndex,
  );
  const currentPrompt = promptPool[promptIndex % promptPool.length];

  const initialValue: ReflectionDraft = {
    body: existing?.body ?? "",
    mood: existing?.mood ?? "",
    prompt: existing?.prompt ?? requestedPrompt?.text ?? currentPrompt.text,
  };
  const {
    value,
    setValue,
    restored,
    savedAt,
    saveDraft,
    clearDraft,
  } = useDeviceLocalJournalDraft<ReflectionDraft>({
    kind: "reflection",
    entryId: editId,
    initialValue,
    isEmpty: reflectionDraftIsEmpty,
    clearedValue: { body: "", mood: "", prompt: "" },
  });

  function setField<K extends keyof ReflectionDraft>(
    field: K,
    next: ReflectionDraft[K],
  ) {
    setValue((draft) => ({ ...draft, [field]: next }));
  }

  function save() {
    if (!value.body.trim()) return;
    const mood = value.mood || undefined;
    if (isEdit && existing) {
      updateReflection(existing.id, {
        body: value.body.trim(),
        mood,
        prompt: value.prompt || undefined,
      });
      toast("Reflection updated.");
    } else {
      addReflection({
        body: value.body,
        mood,
        prompt: value.prompt || undefined,
        relatedVerseReference: verseRef,
      });
      toast("Reflection saved.", { variant: "success" });
    }
    clearDraft();
    router.replace("/app/prayer");
  }

  function discard() {
    clearDraft();
    router.replace("/app/prayer");
  }

  if (editId && !existing) {
    return (
      <PageContainer className="pt-safe">
        <div className="pt-6">
          <Link
            href="/app/prayer"
            className="inline-flex min-h-11 items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
          >
            <IconArrowLeft size={16} /> Prayer Journal
          </Link>
        </div>
        <PaperCard variant="quiet" padding="lg" className="mt-6 text-center">
          <p className="text-[0.9375rem] text-ash">
            We couldn’t find this entry. It may have been deleted on another device.
          </p>
          <GentleLink variant="primary" size="md" href="/app/prayer" className="mt-4">
            Back to Prayer Journal
          </GentleLink>
        </PaperCard>
      </PageContainer>
    );
  }

  return (
    <JournalPrivacyBoundary onBackground={saveDraft}>
    <PageContainer className="pt-safe pb-10">
      <div className="flex min-h-16 items-center justify-between gap-3 pt-3">
        <Link
          href="/app/prayer"
          onClick={saveDraft}
          className="inline-flex min-h-11 items-center px-1 text-[0.9375rem] text-ash transition-colors hover:text-charcoal"
        >
          Close
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[0.75rem] uppercase tracking-[0.12em] text-ash">
            Prayer Journal
          </p>
          <h1 className="truncate font-display text-[1.0625rem] text-graphite">
            {isEdit ? "Edit reflection" : "New reflection"}
          </h1>
        </div>
        <GentleButton
          variant="primary"
          size="sm"
          onClick={save}
          disabled={!value.body.trim()}
        >
          Done
        </GentleButton>
      </div>

      {restored && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-[var(--radius-button)] border border-gold-500/35 bg-gold-500/10 px-3.5 py-2.5">
          <p className="text-[0.8125rem] text-charcoal">
            Your unfinished draft was recovered from this device.
          </p>
          <button
            type="button"
            onClick={discard}
            className="min-h-11 shrink-0 text-[0.8125rem] font-medium text-accent"
          >
            Discard
          </button>
        </div>
      )}

      <PaperCard variant="paper" padding="md" className="mt-3">
        {verseRef && (
          <p className="mb-3 text-[0.75rem] uppercase tracking-[0.12em] text-accent">
            Reflecting on {verseRef}
          </p>
        )}
        {value.prompt && (
          <label
            htmlFor="reflection-body"
            className="block font-display text-[1.125rem] leading-snug text-graphite"
          >
            {value.prompt}
          </label>
        )}
        {!value.prompt && (
          <label htmlFor="reflection-body" className="sr-only">
            Your reflection
          </label>
        )}
        <textarea
          ref={textareaRef}
          id="reflection-body"
          value={value.body}
          onChange={(event) => setField("body", event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          rows={14}
          placeholder="Start wherever you are…"
          autoFocus
          className="mt-4 min-h-[44vh] w-full resize-y bg-transparent text-[1.0625rem] leading-[1.8] text-graphite outline-none placeholder:text-fog"
        />
        <JournalEditorToolbar
          textareaRef={textareaRef}
          value={value.body}
          onChange={(body) => setField("body", body)}
          className="mt-2 border-t border-mist pt-2"
        />
      </PaperCard>

      <p className="mt-2 px-1 text-[0.75rem] text-ash" aria-live="polite">
        {savedAt
          ? "Draft saved on this device."
          : "Unfinished drafts stay on this device until you save."}
      </p>

      <PaperCard variant="quiet" padding="md" className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.75rem] uppercase tracking-[0.12em] text-gilt">
            Guided reflection
          </p>
          <button
            type="button"
            onClick={() => {
              const nextIndex = (promptIndex + 1) % promptPool.length;
              setPromptIndex(nextIndex);
              setField("prompt", promptPool[nextIndex].text);
            }}
            className="min-h-11 text-[0.8125rem] font-medium text-accent"
          >
            Another prompt
          </button>
        </div>
        <p className="font-display text-[1.0625rem] leading-relaxed text-graphite">
          {currentPrompt.text}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4">
          <button
            type="button"
            onClick={() => setField("prompt", currentPrompt.text)}
            className="min-h-11 text-[0.875rem] font-medium text-accent"
          >
            Use this prompt
          </button>
          {value.prompt && (
            <button
              type="button"
              onClick={() => setField("prompt", "")}
              className="min-h-11 text-[0.875rem] text-ash"
            >
              Write freely instead
            </button>
          )}
        </div>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-ash">
          Prompts are built in and never generated from your journal text.
        </p>
      </PaperCard>

      <PaperCard variant="quiet" padding="md" className="mt-4">
        <MoodPicker
          value={value.mood || undefined}
          onChange={(mood) => setField("mood", mood ?? "")}
        />
      </PaperCard>

      <div className="mt-7 flex items-center justify-between gap-3">
        <p className="max-w-xs text-[0.75rem] leading-relaxed text-ash">
          Saved entries sync to your BibleQuest account when you are signed in.
        </p>
        {(restored || value.body.trim()) && (
          <button
            type="button"
            onClick={discard}
            className="min-h-11 shrink-0 px-1 text-[0.8125rem] text-rose-700"
          >
            Discard draft
          </button>
        )}
      </div>
    </PageContainer>
    </JournalPrivacyBoundary>
  );
}

export function ReflectionComposer() {
  return (
    <ClientOnly>
      <ReflectionComposerInner />
    </ClientOnly>
  );
}
