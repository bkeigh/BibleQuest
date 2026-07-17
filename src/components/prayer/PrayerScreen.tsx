"use client";

/**
 * Private prayer-journal index. It derives active, answered, and archived
 * views from the local-first store and keeps filtering, editing, and deletion
 * controls close to the journal entries they affect.
 */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { PixelMascot } from "@/components/design-system/PixelMascot";
import { Disclosure } from "@/components/design-system/Disclosure";
import { CATEGORY_LABEL } from "@/components/prayer/PrayerComposer";
import { IconPlus } from "@/components/design-system/icons";
import { expander } from "@/lib/motion";
import { emptyStates } from "@/lib/questos/copy";
import { formatShortDate } from "@/lib/utils/dates";
import type { Prayer, PrayerCategory, PrayerStatus } from "@/lib/questos/types";
import { cn } from "@/lib/utils/cn";
import { useStrings } from "@/lib/i18n";

type Tab = "active" | "answered" | "archived";
const TABS: Tab[] = ["active", "answered", "archived"];
const TAB_LABEL: Record<Tab, string> = {
  active: "Active",
  answered: "Answered",
  archived: "Archived",
};

function PrayerScreenInner() {
  const t = useStrings();
  const prayers = useQuestOS((s) => s.prayers);
  const [tab, setTab] = useState<Tab>("active");
  const [category, setCategory] = useState<PrayerCategory | null>(null);
  const tabRefs = useRef<Map<Tab, HTMLButtonElement>>(new Map());

  const inTab = useMemo(
    () =>
      prayers
        .filter((p) => p.status === tab)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [prayers, tab]
  );

  // Topics present in the current tab — the filter only appears when it
  // would actually narrow something.
  const categories = useMemo(() => {
    const set = new Set<PrayerCategory>();
    for (const p of inTab) set.add(p.category);
    return [...set];
  }, [inTab]);

  // Only apply (and advertise) the topic filter when it exists in this tab.
  const activeCategory =
    category && categories.includes(category) ? category : null;
  const visible = activeCategory
    ? inTab.filter((p) => p.category === activeCategory)
    : inTab;

  function onTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? TABS[(i + 1) % TABS.length]
        : TABS[(i + TABS.length - 1) % TABS.length];
    setTab(next);
    tabRefs.current.get(next)?.focus();
  }

  return (
    <>
      <PageHeader
        title={t.nav.prayer}
        subtitle="What you’re praying for, in one place."
        action={
          <GentleLink variant="outline" size="sm" href="/app/prayer/new">
            <IconPlus size={16} /> New
          </GentleLink>
        }
      />
      <PageContainer>
        <div
          role="tablist"
          aria-label="Prayer status"
          onKeyDown={onTabKeyDown}
          className="mb-4 flex gap-1 rounded-full border border-mist bg-linen p-1"
        >
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              id={`prayer-tab-${t}`}
              aria-selected={tab === t}
              aria-controls="prayer-tabpanel"
              tabIndex={tab === t ? 0 : -1}
              ref={(el) => {
                if (el) tabRefs.current.set(t, el);
              }}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-full py-2 text-[0.875rem] transition-all duration-300",
                tab === t
                  ? "bg-paper text-graphite paper-shadow"
                  : "text-ash hover:text-charcoal"
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {categories.length > 1 && (
          <Disclosure
            label={
              <span className="text-[0.875rem] font-normal text-ash">
                Filter by topic
              </span>
            }
            summary={
              activeCategory ? (
                <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[0.8125rem] font-medium text-accent">
                  {CATEGORY_LABEL[activeCategory]}
                </span>
              ) : undefined
            }
            className="mb-3"
          >
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(category === c ? null : c)}
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
          </Disclosure>
        )}

        <div
          role="tabpanel"
          id="prayer-tabpanel"
          aria-labelledby={`prayer-tab-${tab}`}
        >
          {visible.length === 0 ? (
            <EmptyPrayer tab={tab} filtered={inTab.length > 0} />
          ) : (
            <div className="space-y-3 pb-6">
              {visible.map((p) => (
                <PrayerCard key={p.id} prayer={p} />
              ))}
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}

function EmptyPrayer({ tab, filtered }: { tab: Tab; filtered: boolean }) {
  // Prayers exist in this tab, but the topic filter excluded them all.
  if (filtered) {
    return (
      <PaperCard variant="quiet" padding="lg" className="text-center">
        <p className="text-[0.9375rem] text-ash">
          Nothing under that topic here. Clear the filter to see everything.
        </p>
      </PaperCard>
    );
  }
  if (tab === "answered") {
    return (
      <PaperCard variant="quiet" padding="lg" className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15">
          <PixelIcon name="flower" size={5} />
        </div>
        <p className="text-[0.9375rem] text-ash">
          Answered prayers will collect here.
        </p>
      </PaperCard>
    );
  }
  if (tab === "archived") {
    return (
      <PaperCard variant="quiet" padding="lg" className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-linen ring-1 ring-mist">
          <PixelIcon name="leaf" size={5} />
        </div>
        <p className="text-[0.9375rem] text-ash">
          Archived prayers stay here. Bring one back anytime.
        </p>
      </PaperCard>
    );
  }
  return (
    <PaperCard variant="atmospheric" padding="lg" className="text-center">
      <PixelMascot name="dove" size={8} className="mb-4" />
      <p className="mx-auto max-w-xs text-[1rem] leading-relaxed text-charcoal">
        {emptyStates.prayer}
      </p>
      <GentleLink variant="primary" size="md" href="/app/prayer/new" className="mt-5">
        Write your first prayer
      </GentleLink>
    </PaperCard>
  );
}

const STATUS_ICON: Record<PrayerStatus, "candle" | "flower" | "leaf"> = {
  active: "candle",
  answered: "flower",
  archived: "leaf",
};

/** A quiet text button for the inline card actions. */
function CardAction({
  onClick,
  tone = "accent",
  children,
}: {
  onClick: () => void;
  tone?: "accent" | "ash" | "rose";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-[0.875rem] transition-colors",
        tone === "accent" && "text-accent hover:text-accent/80",
        tone === "ash" && "text-ash hover:text-charcoal",
        tone === "rose" && "text-ash hover:text-rose-700"
      )}
    >
      {children}
    </button>
  );
}

function PrayerCard({ prayer }: { prayer: Prayer }) {
  const { toast } = useToast();
  const markAnswered = useQuestOS((s) => s.markPrayerAnswered);
  const archivePrayer = useQuestOS((s) => s.archivePrayer);
  const unarchivePrayer = useQuestOS((s) => s.unarchivePrayer);
  const deletePrayer = useQuestOS((s) => s.deletePrayer);
  const [answering, setAnswering] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [note, setNote] = useState("");
  const noteId = `prayer-note-${prayer.id}`;

  // The expanders are mutually exclusive; hide the action row while either is open.
  const showActions = !answering && !confirmingDelete;

  return (
    <PaperCard variant="paper" padding="md">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          <PixelIcon name={STATUS_ICON[prayer.status]} size={5} />
        </span>
        <div className="min-w-0 flex-1">
          {prayer.title && (
            <h3 className="font-display text-[1.125rem] text-graphite">
              {prayer.title}
            </h3>
          )}
          <p className="mt-0.5 whitespace-pre-wrap text-[1rem] leading-relaxed text-charcoal">
            {prayer.body}
          </p>
          {prayer.status === "answered" && prayer.answerReflection && (
            <div className="mt-3 rounded-[var(--radius-button)] bg-gold-500/12 px-3.5 py-2.5">
              <p className="text-[0.75rem] uppercase tracking-wide text-gilt">
                How it was answered
              </p>
              <p className="mt-1 text-[0.9375rem] text-charcoal">
                {prayer.answerReflection}
              </p>
            </div>
          )}
          <p className="mt-2 text-[0.75rem] text-ash">
            {prayer.status === "answered" && prayer.answeredAt
              ? `Answered ${formatShortDate(prayer.answeredAt)}`
              : formatShortDate(prayer.createdAt)}
            {" · "}
            {CATEGORY_LABEL[prayer.category]}
          </p>

          {showActions && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {prayer.status === "active" && (
                <CardAction onClick={() => setAnswering(true)}>
                  Mark as answered
                </CardAction>
              )}
              {prayer.status !== "archived" && (
                <Link
                  href={`/app/prayer/new?edit=${prayer.id}`}
                  className="text-[0.875rem] text-accent transition-colors hover:text-accent/80"
                >
                  Edit
                </Link>
              )}
              {prayer.status === "archived" ? (
                <CardAction
                  onClick={() => {
                    unarchivePrayer(prayer.id);
                    toast("Restored.");
                  }}
                >
                  Bring back
                </CardAction>
              ) : (
                <CardAction
                  tone="ash"
                  onClick={() => {
                    archivePrayer(prayer.id);
                    toast("Archived.", {
                      action: {
                        label: "Undo",
                        onClick: () => unarchivePrayer(prayer.id),
                      },
                    });
                  }}
                >
                  Archive
                </CardAction>
              )}
              <CardAction tone="rose" onClick={() => setConfirmingDelete(true)}>
                Delete
              </CardAction>
            </div>
          )}

          <AnimatePresence>
            {answering && (
              <motion.div
                variants={expander}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="overflow-hidden"
              >
                <div className="mt-3">
                  <label
                    htmlFor={noteId}
                    className="mb-2 block text-[0.875rem] text-charcoal"
                  >
                    How would you like to remember this? (optional)
                  </label>
                  <textarea
                    id={noteId}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="What happened…"
                    className="w-full resize-none rounded-[var(--radius-button)] border border-mist bg-linen px-3 py-2.5 text-[0.9375rem] outline-none focus:border-accent"
                  />
                  <div className="mt-2.5 flex gap-2">
                    <GentleButton
                      variant="gold"
                      size="sm"
                      onClick={() => {
                        markAnswered(prayer.id, note);
                        toast("Marked answered.", { variant: "celebrate" });
                        setAnswering(false);
                      }}
                    >
                      Save
                    </GentleButton>
                    <GentleButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setAnswering(false)}
                    >
                      Cancel
                    </GentleButton>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                    Delete this prayer? It can’t be undone.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <GentleButton
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        deletePrayer(prayer.id);
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
        </div>
      </div>
    </PaperCard>
  );
}

export function PrayerScreen() {
  return (
    <ClientOnly>
      <PrayerScreenInner />
    </ClientOnly>
  );
}
