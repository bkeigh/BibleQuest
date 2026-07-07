"use client";

import { useQuestOS } from "@/lib/questos/store";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconPlus } from "@/components/design-system/icons";
import { emptyStates } from "@/lib/questos/copy";
import { formatShortDate } from "@/lib/utils/dates";
import { questBySlug } from "@/data/seed/quests";

function ReflectionScreenInner() {
  const reflections = useQuestOS((s) => s.reflections);
  const sorted = [...reflections].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <>
      <PageHeader
        title="Reflections"
        subtitle="What you’ve noticed along the way."
        action={
          <GentleLink variant="outline" size="sm" href="/app/reflection/new">
            <IconPlus size={16} /> New
          </GentleLink>
        }
      />
      <PageContainer>
        {sorted.length === 0 ? (
          <PaperCard variant="atmospheric" padding="lg" className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-linen ring-1 ring-mist">
              <PixelIcon name="sun" size={6} />
            </div>
            <p className="mx-auto max-w-xs text-[1rem] leading-relaxed text-charcoal">
              {emptyStates.reflections}
            </p>
            <GentleLink
              variant="dark"
              href="/app/reflection/new"
              className="mt-5"
            >
              Write a reflection
            </GentleLink>
          </PaperCard>
        ) : (
          <div className="space-y-3 pb-6">
            {sorted.map((r) => {
              const quest = r.relatedQuestSlug
                ? questBySlug.get(r.relatedQuestSlug)
                : null;
              return (
                <PaperCard key={r.id} variant="paper" padding="md">
                  {(quest || r.relatedVerseReference) && (
                    <p className="mb-1.5 text-[0.75rem] uppercase tracking-wide text-olive-500">
                      {quest ? quest.title : `On ${r.relatedVerseReference}`}
                    </p>
                  )}
                  {r.prompt && (
                    <p className="text-[0.875rem] italic text-ash">{r.prompt}</p>
                  )}
                  <p className="mt-1.5 whitespace-pre-wrap text-[1rem] leading-relaxed text-charcoal">
                    {r.body}
                  </p>
                  <p className="mt-2.5 text-[0.75rem] text-fog">
                    {formatShortDate(r.createdAt)}
                    {r.mood ? ` · ${r.mood}` : ""}
                  </p>
                </PaperCard>
              );
            })}
          </div>
        )}
      </PageContainer>
    </>
  );
}

export function ReflectionScreen() {
  return (
    <ClientOnly>
      <ReflectionScreenInner />
    </ClientOnly>
  );
}
