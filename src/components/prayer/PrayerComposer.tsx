"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconArrowLeft } from "@/components/design-system/icons";
import Link from "next/link";
import { prayerPrompts } from "@/data/seed/prayer-prompts";
import { PRAYER_CATEGORIES, type PrayerCategory } from "@/lib/questos/types";
import { hashString, toDateKey } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

const CATEGORY_LABEL: Record<PrayerCategory, string> = {
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
  const { toast } = useToast();
  const addPrayer = useQuestOS((s) => s.addPrayer);

  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<PrayerCategory>("general");

  // A gentle rotating starter, in case the page is blank.
  const starter = useMemo(() => {
    const i = hashString(toDateKey()) % prayerPrompts.length;
    return prayerPrompts[i];
  }, []);

  function save() {
    if (!body.trim()) return;
    addPrayer({ title, body, category });
    toast("Saved. This is held privately.");
    router.replace("/app/prayer");
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

      <h1 className="mt-5 font-display text-[1.75rem] leading-tight text-graphite">
        A prayer
      </h1>
      <p className="mt-1 text-[0.9375rem] text-ash">
        Speak honestly. This stays private to you.
      </p>

      <PaperCard variant="paper" padding="md" className="mt-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A word for this prayer (optional)"
          className="w-full border-b border-mist bg-transparent pb-2 text-[1.0625rem] text-graphite outline-none placeholder:text-fog focus:border-olive-300"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          placeholder={`e.g. ${starter.text}`}
          className="mt-3 w-full resize-none bg-transparent text-[1.0625rem] leading-relaxed text-graphite outline-none placeholder:text-fog"
          autoFocus
        />
      </PaperCard>

      <p className="mt-5 mb-2 text-[0.8125rem] text-ash">This prayer is about…</p>
      <div className="flex flex-wrap gap-2">
        {PRAYER_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[0.8125rem] transition-all duration-300",
              category === c
                ? "border-olive-500 bg-olive-50 text-olive-700"
                : "border-mist bg-paper text-ash hover:border-olive-300"
            )}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="mt-7 flex items-center gap-3 pb-8">
        <GentleButton
          variant="dark"
          size="lg"
          className="flex-1"
          onClick={save}
          disabled={!body.trim()}
        >
          Save prayer
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
