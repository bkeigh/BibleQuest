"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { IconPlus } from "@/components/design-system/icons";
import { emptyStates } from "@/lib/questos/copy";
import { formatShortDate } from "@/lib/utils/dates";
import type { Prayer, PrayerStatus } from "@/lib/questos/types";
import { cn } from "@/lib/utils/cn";

type Tab = "active" | "answered" | "archived";
const TABS: Tab[] = ["active", "answered", "archived"];

function PrayerScreenInner() {
  const prayers = useQuestOS((s) => s.prayers);
  const [tab, setTab] = useState<Tab>("active");

  const visible = prayers
    .filter((p) => p.status === tab)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <PageHeader
        title="Prayer"
        subtitle="A quiet place to bring what you’re carrying."
        action={
          <GentleLink variant="outline" size="sm" href="/app/prayer/new">
            <IconPlus size={16} /> New
          </GentleLink>
        }
      />
      <PageContainer>
        <div className="mb-4 flex gap-1 rounded-full border border-mist bg-linen p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-full py-2 text-[0.875rem] capitalize transition-all duration-300",
                tab === t
                  ? "bg-paper text-graphite paper-shadow"
                  : "text-ash hover:text-charcoal"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyPrayer tab={tab} />
        ) : (
          <div className="space-y-3 pb-6">
            {visible.map((p) => (
              <PrayerCard key={p.id} prayer={p} />
            ))}
          </div>
        )}
      </PageContainer>
    </>
  );
}

function EmptyPrayer({ tab }: { tab: Tab }) {
  if (tab === "answered") {
    return (
      <PaperCard variant="quiet" padding="lg" className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold-50">
          <PixelIcon name="flower" size={5} />
        </div>
        <p className="text-[0.9375rem] text-ash">
          Answered prayers will gather here, like pressed flowers.
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
          Prayers you set aside rest here. You can bring any of them back.
        </p>
      </PaperCard>
    );
  }
  return (
    <PaperCard variant="atmospheric" padding="lg" className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-50 ring-1 ring-gold-100">
        <PixelIcon name="candle" size={6} animate />
      </div>
      <p className="mx-auto max-w-xs text-[1rem] leading-relaxed text-charcoal">
        {emptyStates.prayer}
      </p>
      <GentleLink variant="dark" size="md" href="/app/prayer/new" className="mt-5">
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
  tone = "olive",
  children,
}: {
  onClick: () => void;
  tone?: "olive" | "ash" | "rose";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-[0.875rem] transition-colors",
        tone === "olive" && "text-olive-700 hover:text-olive-500",
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
            <div className="mt-3 rounded-[var(--radius-button)] bg-gold-50 px-3.5 py-2.5">
              <p className="text-[0.75rem] uppercase tracking-wide text-gold-700">
                How it was answered
              </p>
              <p className="mt-1 text-[0.9375rem] text-charcoal">
                {prayer.answerReflection}
              </p>
            </div>
          )}
          <p className="mt-2 text-[0.75rem] text-fog">
            {prayer.status === "answered" && prayer.answeredAt
              ? `Answered ${formatShortDate(prayer.answeredAt)}`
              : formatShortDate(prayer.createdAt)}
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
                  className="text-[0.875rem] text-olive-700 transition-colors hover:text-olive-500"
                >
                  Edit
                </Link>
              )}
              {prayer.status === "archived" ? (
                <CardAction
                  onClick={() => {
                    unarchivePrayer(prayer.id);
                    toast("Welcomed back.");
                  }}
                >
                  Bring back
                </CardAction>
              ) : (
                <CardAction
                  tone="ash"
                  onClick={() => {
                    archivePrayer(prayer.id);
                    toast("Archived, gently.");
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
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3">
                  <p className="mb-2 text-[0.875rem] text-charcoal">
                    How would you like to remember this? (optional)
                  </p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="What happened…"
                    className="w-full resize-none rounded-[var(--radius-button)] border border-mist bg-linen px-3 py-2.5 text-[0.9375rem] outline-none focus:border-olive-300"
                  />
                  <div className="mt-2.5 flex gap-2">
                    <GentleButton
                      variant="gold"
                      size="sm"
                      onClick={() => {
                        markAnswered(prayer.id, note);
                        toast("Held with gratitude.");
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
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-[var(--radius-button)] bg-linen px-3.5 py-3">
                  <p className="text-[0.875rem] text-charcoal">
                    Let this prayer go? This can’t be undone.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <GentleButton
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        deletePrayer(prayer.id);
                        toast("Released.");
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
