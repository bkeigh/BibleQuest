"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { MoodPicker } from "@/components/reflection/MoodPicker";
import { IconArrowLeft } from "@/components/design-system/icons";
import { reflectionPrompts } from "@/data/seed/reflection-prompts";
import { hashString, toDateKey } from "@/lib/utils/dates";
import type { ReflectionMood } from "@/lib/questos/types";

function ReflectionComposerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const addReflection = useQuestOS((s) => s.addReflection);
  const updateReflection = useQuestOS((s) => s.updateReflection);

  const editId = params.get("edit");
  const existing = useQuestOS((s) =>
    editId ? s.reflections.find((r) => r.id === editId) : undefined
  );
  const isEdit = Boolean(existing);

  const verseRef = params.get("verse") ?? undefined;

  const prompt = useMemo(() => {
    const pool = verseRef
      ? reflectionPrompts.filter((p) => p.context === "after_scripture")
      : reflectionPrompts;
    const list = pool.length ? pool : reflectionPrompts;
    return list[hashString(toDateKey() + (verseRef ?? "")) % list.length];
  }, [verseRef]);

  // Under ClientOnly the store is already hydrated, so an edit target resolves
  // on the first render — seed the fields lazily from it.
  const [body, setBody] = useState(() => existing?.body ?? "");
  const [mood, setMood] = useState<ReflectionMood | undefined>(
    () => existing?.mood
  );

  // Editing preserves the reflection's original prompt and its quest/verse links.
  const displayPrompt = isEdit && existing?.prompt ? existing.prompt : prompt.text;

  function save() {
    if (!body.trim()) return;
    if (isEdit && existing) {
      updateReflection(existing.id, { body: body.trim(), mood });
      toast("Changes saved.");
    } else {
      addReflection({
        body,
        mood,
        prompt: prompt.text,
        relatedVerseReference: verseRef,
      });
      toast("Saved to your journey.");
    }
    router.replace("/app/reflection");
  }

  // An edit link that points at a reflection that no longer exists.
  if (editId && !existing) {
    return (
      <PageContainer className="pt-safe">
        <div className="pt-6">
          <Link
            href="/app/reflection"
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
          >
            <IconArrowLeft size={16} /> Reflections
          </Link>
        </div>
        <PaperCard variant="quiet" padding="lg" className="mt-6 text-center">
          <p className="text-[0.9375rem] text-ash">This reflection is no longer here.</p>
          <GentleLink variant="primary" size="md" href="/app/reflection" className="mt-4">
            Back to reflections
          </GentleLink>
        </PaperCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="pt-safe">
      <div className="pt-6">
        <Link
          href="/app/reflection"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> Reflections
        </Link>
      </div>

      <h1 className="mt-5 font-display text-editorial leading-tight text-graphite">
        {isEdit ? "Editing a reflection" : "A reflection"}
      </h1>
      {verseRef && (
        <p className="mt-1 text-[0.9375rem] text-ash">On {verseRef}</p>
      )}

      <PaperCard variant="paper" padding="md" className="mt-5">
        <label
          htmlFor="reflection-body"
          className="block text-[0.9375rem] font-medium text-graphite"
        >
          {displayPrompt}
        </label>
        <textarea
          id="reflection-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          placeholder="Write freely. No one else sees this."
          autoFocus
          className="mt-3 w-full resize-none bg-transparent text-[1.0625rem] leading-relaxed text-graphite outline-none placeholder:text-fog"
        />
        <div className="mt-2 border-t border-mist pt-3">
          <MoodPicker value={mood} onChange={setMood} />
        </div>
      </PaperCard>

      <div className="mt-6 flex items-center gap-3 pb-8">
        <GentleButton
          variant="primary"
          size="lg"
          className="flex-1"
          onClick={save}
          disabled={!body.trim()}
        >
          {isEdit ? "Save changes" : "Save reflection"}
        </GentleButton>
        <Link
          href="/app/reflection"
          className="px-2 py-2 text-[0.9375rem] text-ash transition-colors hover:text-charcoal"
        >
          Cancel
        </Link>
      </div>
    </PageContainer>
  );
}

export function ReflectionComposer() {
  return (
    <ClientOnly>
      <ReflectionComposerInner />
    </ClientOnly>
  );
}
