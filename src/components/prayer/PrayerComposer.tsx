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
import { Disclosure } from "@/components/design-system/Disclosure";
import { JournalEditorToolbar } from "@/components/journal/JournalEditorToolbar";
import { JournalPrivacyBoundary } from "@/components/journal/JournalPrivacyBoundary";
import { IconArrowLeft } from "@/components/design-system/icons";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import { PRAYER_CATEGORIES, type PrayerCategory } from "@/lib/questos/types";
import { useDeviceLocalJournalDraft } from "@/lib/questos/journal-drafts";
import { hashString, toDateKey } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

export const CATEGORY_LABEL: Record<PrayerCategory, string> = {
  morning: "Morning",
  evening: "Evening",
  gratitude: "Gratitude",
  difficulty: "In difficulty",
  intercession: "For others",
  stillness: "Stillness",
  forgiveness: "Forgiveness",
  courage: "Courage",
  family: "Family",
  work: "Work",
  general: "General",
};

type PrayerDraft = {
  title: string;
  body: string;
  category: PrayerCategory;
};

const prayerDraftIsEmpty = (draft: PrayerDraft) =>
  !draft.title.trim() && !draft.body.trim();

function PrayerComposerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const addPrayer = useQuestOS((state) => state.addPrayer);
  const updatePrayer = useQuestOS((state) => state.updatePrayer);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const editId = params.get("edit") ?? undefined;
  const existing = useQuestOS((state) =>
    editId ? state.prayers.find((prayer) => prayer.id === editId) : undefined,
  );
  const isEdit = Boolean(existing);
  const requestedPrompt = useMemo(() => {
    const id = params.get("prompt");
    return id ? prayerPrompts.find((prompt) => prompt.id === id) : undefined;
  }, [params]);
  const dailyPromptIndex = useMemo(
    () => hashString(toDateKey()) % prayerPrompts.length,
    [],
  );
  const [promptIndex, setPromptIndex] = useState(() =>
    requestedPrompt
      ? Math.max(
          0,
          prayerPrompts.findIndex((prompt) => prompt.id === requestedPrompt.id),
        )
      : dailyPromptIndex,
  );
  const prompt = prayerPrompts[promptIndex];

  const initialValue: PrayerDraft = {
    title: existing?.title ?? "",
    body: existing?.body ?? requestedPrompt?.text ?? "",
    category: existing?.category ?? requestedPrompt?.category ?? "general",
  };
  const {
    value,
    setValue,
    restored,
    savedAt,
    saveDraft,
    clearDraft,
  } = useDeviceLocalJournalDraft<PrayerDraft>({
    kind: "prayer",
    entryId: editId,
    initialValue,
    isEmpty: prayerDraftIsEmpty,
    clearedValue: { title: "", body: "", category: "general" },
  });

  function setField<K extends keyof PrayerDraft>(
    field: K,
    next: PrayerDraft[K],
  ) {
    setValue((draft) => ({ ...draft, [field]: next }));
  }

  function save() {
    if (!value.body.trim()) return;
    if (isEdit && existing) {
      updatePrayer(existing.id, {
        title: value.title.trim() || undefined,
        body: value.body.trim(),
        category: value.category,
      });
      toast("Prayer updated.");
    } else {
      addPrayer({
        title: value.title,
        body: value.body,
        category: value.category,
      });
      toast("Prayer saved.", { variant: "success" });
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
            {isEdit ? "Edit prayer" : "New prayer"}
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
        <label htmlFor="prayer-title" className="sr-only">
          Prayer title (optional)
        </label>
        <input
          id="prayer-title"
          value={value.title}
          onChange={(event) => setField("title", event.target.value)}
          placeholder="Title (optional)"
          className="w-full border-b border-mist bg-transparent pb-3 font-display text-[1.25rem] text-graphite outline-none placeholder:font-sans placeholder:text-fog focus:border-accent"
        />
        <label htmlFor="prayer-body" className="sr-only">
          Your prayer
        </label>
        <textarea
          ref={textareaRef}
          id="prayer-body"
          value={value.body}
          onChange={(event) => setField("body", event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
          rows={14}
          placeholder={prompt.text}
          className="mt-4 min-h-[44vh] w-full resize-y bg-transparent text-[1.0625rem] leading-[1.8] text-graphite outline-none placeholder:text-fog"
          autoFocus
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

      <Disclosure
        variant="card"
        label="Theme (optional)"
        summary={
          <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[0.75rem] text-accent">
            {CATEGORY_LABEL[value.category]}
          </span>
        }
        className="mt-5"
      >
        <div role="group" aria-label="Prayer theme" className="flex flex-wrap gap-2 pb-2">
          {PRAYER_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={value.category === category}
              onClick={() => setField("category", category)}
              className={cn(
                "min-h-11 rounded-full border px-3 text-[0.8125rem] transition-all",
                value.category === category
                  ? "border-accent bg-accent-surface text-accent"
                  : "border-mist bg-paper text-ash hover:border-accent/50",
              )}
            >
              {CATEGORY_LABEL[category]}
            </button>
          ))}
        </div>
      </Disclosure>

      <PaperCard variant="quiet" padding="md" className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.75rem] uppercase tracking-[0.12em] text-gilt">
            Need words?
          </p>
          <button
            type="button"
            onClick={() => setPromptIndex((index) => (index + 1) % prayerPrompts.length)}
            className="min-h-11 text-[0.8125rem] font-medium text-accent"
          >
            Another prompt
          </button>
        </div>
        <p className="font-display text-[1.0625rem] leading-relaxed text-graphite">
          {prompt.text}
        </p>
        <button
          type="button"
          onClick={() => {
            setValue((draft) => ({
              ...draft,
              body: draft.body.trim()
                ? `${draft.body.trimEnd()}\n\n${prompt.text}`
                : prompt.text,
              category: prompt.category,
            }));
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          className="mt-2 min-h-11 text-[0.875rem] font-medium text-accent"
        >
          Add to prayer
        </button>
        <p className="mt-1 text-[0.75rem] leading-relaxed text-ash">
          These prompts are built in and do not inspect your journal.
        </p>
      </PaperCard>

      <div className="mt-7 flex items-center justify-between gap-3">
        <p className="max-w-xs text-[0.75rem] leading-relaxed text-ash">
          Saved entries sync to your BibleQuest account when you are signed in.
        </p>
        {(restored || value.body.trim() || value.title.trim()) && (
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

export function PrayerComposer() {
  return (
    <ClientOnly>
      <PrayerComposerInner />
    </ClientOnly>
  );
}
