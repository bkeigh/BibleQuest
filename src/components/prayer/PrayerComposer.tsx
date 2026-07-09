"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { IconArrowLeft } from "@/components/design-system/icons";
import Link from "next/link";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import { PRAYER_CATEGORIES, type PrayerCategory } from "@/lib/questos/types";
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

function PrayerComposerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const addPrayer = useQuestOS((s) => s.addPrayer);
  const updatePrayer = useQuestOS((s) => s.updatePrayer);

  const editId = params.get("edit");
  const existing = useQuestOS((s) =>
    editId ? s.prayers.find((p) => p.id === editId) : undefined
  );
  const isEdit = Boolean(existing);

  // Under ClientOnly the store is already hydrated, so an edit target resolves
  // on the first render — seed the fields lazily from it.
  const [body, setBody] = useState(() => existing?.body ?? "");
  const [title, setTitle] = useState(() => existing?.title ?? "");
  const [category, setCategory] = useState<PrayerCategory>(
    () => existing?.category ?? "general"
  );

  // A gentle rotating starter, in case the page is blank.
  const starter = useMemo(() => {
    const i = hashString(toDateKey()) % prayerPrompts.length;
    return prayerPrompts[i];
  }, []);

  function save() {
    if (!body.trim()) return;
    if (isEdit && existing) {
      updatePrayer(existing.id, { title: title.trim() || undefined, body: body.trim(), category });
      toast("Changes saved.");
    } else {
      addPrayer({ title, body, category });
      toast("Saved. Only you can see this.", { variant: "success" });
    }
    router.replace("/app/prayer");
  }

  // An edit link that points at a prayer that no longer exists.
  if (editId && !existing) {
    return (
      <PageContainer className="pt-safe">
        <div className="pt-6">
          <Link
            href="/app/prayer"
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
          >
            <IconArrowLeft size={16} /> Prayer
          </Link>
        </div>
        <PaperCard variant="quiet" padding="lg" className="mt-6 text-center">
          <p className="text-[0.9375rem] text-ash">This prayer is no longer here.</p>
          <GentleLink variant="primary" size="md" href="/app/prayer" className="mt-4">
            Back to prayer
          </GentleLink>
        </PaperCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="pt-safe">
      <div className="pt-6">
        <Link
          href="/app/prayer"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> Prayer
        </Link>
      </div>

      <h1 className="mt-5 font-display text-editorial leading-tight text-graphite">
        {isEdit ? "Editing a prayer" : "A prayer"}
      </h1>
      <p className="mt-1 text-[0.9375rem] text-ash">
        Speak honestly. This stays private to you.
      </p>

      <PaperCard variant="paper" padding="md" className="mt-5">
        <label htmlFor="prayer-title" className="sr-only">
          Title (optional)
        </label>
        <input
          id="prayer-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (optional)"
          className="w-full border-b border-mist bg-transparent pb-2 text-[1.0625rem] text-graphite outline-none placeholder:text-fog focus:border-accent"
        />
        <label htmlFor="prayer-body" className="sr-only">
          Your prayer
        </label>
        <textarea
          id="prayer-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          placeholder={`e.g. ${starter.text}`}
          className="mt-3 w-full resize-none bg-transparent text-[1.0625rem] leading-relaxed text-graphite outline-none placeholder:text-fog"
          autoFocus
        />
      </PaperCard>

      <p id="prayer-category-label" className="mt-5 mb-2 text-[0.8125rem] text-ash">
        This prayer is about…
      </p>
      <div
        role="group"
        aria-labelledby="prayer-category-label"
        className="flex flex-wrap gap-2"
      >
        {PRAYER_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[0.8125rem] transition-all duration-300",
              category === c
                ? "border-accent bg-accent-surface text-accent"
                : "border-mist bg-paper text-ash hover:border-accent/50"
            )}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="mt-7 flex items-center gap-3 pb-8">
        <GentleButton
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={save}
          disabled={!body.trim()}
        >
          {isEdit ? "Save changes" : "Save prayer"}
        </GentleButton>
        <Link
          href="/app/prayer"
          className="px-2 py-2 text-[0.9375rem] text-ash transition-colors hover:text-charcoal"
        >
          Cancel
        </Link>
      </div>
    </PageContainer>
  );
}

export function PrayerComposer() {
  return (
    <ClientOnly>
      <PrayerComposerInner />
    </ClientOnly>
  );
}
