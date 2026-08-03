"use client";

/**
 * The reflection journal embedded in Prayer. Entries are rendered newest
 * first with their optional quest or verse context; mutations remain in
 * QuestOS so guest persistence and signed-in sync follow the same path.
 */
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import { expander } from "@/lib/motion";
import { emptyStates } from "@/lib/questos/copy";
import { formatShortDate } from "@/lib/utils/dates";
import { questBySlug } from "@/data/seed/quests";
import type { Reflection } from "@/lib/questos/types";
import { JournalEntryBody } from "@/components/journal/JournalEntryBody";
import { cn } from "@/lib/utils/cn";

export function ReflectionPanel() {
  const reflections = useQuestOS((s) => s.reflections);
  const sorted = reflections
    .filter((reflection) => !reflection.archivedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <section aria-labelledby="reflection-journal-heading">
      <div className="mb-3 px-1">
        <h2
          id="reflection-journal-heading"
          className="font-display text-[1.125rem] text-graphite"
        >
          Reflection journal
        </h2>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ash">
          A private record of what you’re learning and noticing.
        </p>
      </div>

      {sorted.length === 0 ? (
        <PaperCard variant="atmospheric" padding="lg" className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-linen ring-1 ring-mist">
            <ArtIcon name="sun" size={92} />
          </div>
          <h3 className="font-display text-[1.125rem] text-graphite">
            Notice what’s stirring
          </h3>
          <p className="mx-auto mt-1.5 max-w-xs text-[0.9375rem] leading-relaxed text-ash">
            {emptyStates.reflections} A few honest lines are enough.
          </p>
          <GentleLink
            variant="primary"
            href="/app/prayer/reflection/new"
            className="mt-5"
          >
            Write your first reflection
          </GentleLink>
        </PaperCard>
      ) : (
        <div className="space-y-3 pb-2">
          {sorted.map((r) => (
            <ReflectionCard key={r.id} reflection={r} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ReflectionCard({
  reflection: r,
  showDate = true,
}: {
  reflection: Reflection;
  showDate?: boolean;
}) {
  const { toast } = useToast();
  const deleteReflection = useQuestOS((s) => s.deleteReflection);
  const archiveReflection = useQuestOS((s) => s.archiveReflection);
  const unarchiveReflection = useQuestOS((s) => s.unarchiveReflection);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const quest = r.relatedQuestSlug ? questBySlug.get(r.relatedQuestSlug) : null;
  const longEntry = r.body.length > 300 || r.body.split("\n").length > 6;

  return (
    <PaperCard as="article" variant="paper" padding="md">
      {(quest || r.relatedVerseReference) && (
        <p className="mb-1.5 text-[0.75rem] uppercase tracking-wide text-accent">
          {quest ? quest.title : `On ${r.relatedVerseReference}`}
        </p>
      )}
      {r.prompt && (
        <p className="text-[0.875rem] italic text-ash">{r.prompt}</p>
      )}
      <div
        className={cn(
          "relative mt-1.5",
          longEntry && !expanded && "max-h-36 overflow-hidden",
        )}
      >
        <JournalEntryBody className="text-[1rem] leading-relaxed text-charcoal">
          {r.body}
        </JournalEntryBody>
        {longEntry && !expanded && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-paper to-transparent"
          />
        )}
      </div>
      {longEntry && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 min-h-11 text-[0.8125rem] font-medium text-accent"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
      {(showDate || r.mood || r.archivedAt) && (
        <p className="mt-2.5 text-[0.75rem] text-ash">
          {showDate ? formatShortDate(r.createdAt) : ""}
          {showDate && r.mood ? " · " : ""}
          {r.mood ?? ""}
          {(showDate || r.mood) && r.archivedAt ? " · " : ""}
          {r.archivedAt ? "Archived" : ""}
        </p>
      )}

      {!confirmingDelete && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/app/prayer/reflection/new?edit=${r.id}`}
            className="inline-flex min-h-11 items-center text-[0.875rem] text-accent transition-colors hover:text-accent/80"
          >
            Edit
          </Link>
          {r.archivedAt ? (
            <button
              onClick={() => {
                unarchiveReflection(r.id);
                toast("Reflection restored.");
              }}
              className="min-h-11 text-[0.875rem] text-accent transition-colors hover:text-accent/80"
            >
              Restore
            </button>
          ) : (
            <button
              onClick={() => {
                archiveReflection(r.id);
                toast("Reflection archived.", {
                  action: {
                    label: "Undo",
                    onClick: () => unarchiveReflection(r.id),
                  },
                });
              }}
              className="min-h-11 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
            >
              Archive
            </button>
          )}
          <button
            onClick={() => setConfirmingDelete(true)}
            className="min-h-11 text-[0.875rem] text-ash transition-colors hover:text-rose-700"
          >
            Delete
          </button>
        </div>
      )}

      <AnimatePresence>
        {confirmingDelete && (
          <motion.div
            variants={expander}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-[var(--radius-button)] bg-linen px-3.5 py-3">
              <p className="text-[0.875rem] text-charcoal">
                Delete this reflection? It can’t be undone.
              </p>
              <div className="mt-2.5 flex gap-2">
                <GentleButton
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    deleteReflection(r.id);
                    toast("Deleted.");
                  }}
                >
                  Delete
                </GentleButton>
                <GentleButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </GentleButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PaperCard>
  );
}

export function ReflectionScreen() {
  return (
    <ClientOnly>
      <PageHeader
        title="Prayer"
        subtitle="A private place to pray, notice, and remember."
      />
      <PageContainer className="pb-6">
        <ReflectionPanel />
      </PageContainer>
    </ClientOnly>
  );
}
