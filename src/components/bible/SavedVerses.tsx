"use client";

import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { IconArrowLeft, IconBookmarkFilled } from "@/components/design-system/icons";
import { emptyStates } from "@/lib/questos/copy";
import { cleanVerseText } from "@/lib/utils/scripture";

function SavedVersesInner() {
  const { toast } = useToast();
  const bookmarks = useQuestOS((s) => s.bookmarks);
  const toggleBookmark = useQuestOS((s) => s.toggleBookmark);

  const sorted = [...bookmarks].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <PageContainer className="pt-safe">
      <div className="pt-6">
        <Link
          href="/app/bible"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-ash transition-colors hover:text-charcoal"
        >
          <IconArrowLeft size={16} /> Bible
        </Link>
      </div>

      <h1 className="mt-5 font-display text-editorial text-graphite">Saved verses</h1>

      {sorted.length === 0 ? (
        <PaperCard variant="quiet" padding="lg" className="mt-6 text-center">
          <p className="text-[0.9375rem] text-ash">{emptyStates.bookmarks}</p>
          <GentleLink variant="text" href="/app/bible" className="mt-2">
            Open the Bible
          </GentleLink>
        </PaperCard>
      ) : (
        <div className="mt-6 space-y-3 pb-8">
          {sorted.map((b) => (
            <PaperCard key={b.id} variant="paper" padding="md">
              <Link href={`/app/bible/${b.bookSlug}/${b.chapter}`} className="block">
                <blockquote className="verse-text">
                  “{cleanVerseText(b.text)}”
                </blockquote>
                <cite className="mt-2 block text-[0.875rem] not-italic text-accent">
                  {b.bookName} {b.chapter}:{b.verse}
                </cite>
              </Link>
              <button
                onClick={() => {
                  const entry = {
                    bookSlug: b.bookSlug,
                    bookName: b.bookName,
                    chapter: b.chapter,
                    verse: b.verse,
                    text: b.text,
                  };
                  toggleBookmark(entry);
                  toast("Removed.", {
                    action: {
                      label: "Undo",
                      onClick: () => toggleBookmark(entry),
                    },
                  });
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[0.8125rem] text-ash transition-colors hover:text-charcoal"
              >
                <IconBookmarkFilled size={15} className="text-accent" /> Saved
              </button>
            </PaperCard>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

export function SavedVerses() {
  return (
    <ClientOnly>
      <SavedVersesInner />
    </ClientOnly>
  );
}
