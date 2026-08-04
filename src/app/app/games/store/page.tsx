import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import { IconArrowLeft } from "@/components/design-system/icons";
import { ArcadeStore } from "@/components/games/ArcadeStore";
import { GREEN_FEATURES } from "@/lib/features/green";

export const metadata: Metadata = {
  title: "Arcade Store",
  description:
    "Question Skips and the Seven Days Game Pass for BibleQuest Arcade.",
};

export default function ArcadeStorePage() {
  if (!GREEN_FEATURES.games) notFound();

  return (
    <>
      <PageHeader
        title="Arcade Store"
        subtitle="Question Skips and a permanent Seven Days Game Pass."
      />
      <PageContainer className="pb-8 pt-2">
        <Link
          href="/app/games"
          className="-ms-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-small text-ash transition-colors hover:text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <IconArrowLeft size={16} /> Arcade
        </Link>
        <div className="mt-4">
          <ArcadeStore />
        </div>
      </PageContainer>
    </>
  );
}
