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
    "More days to play and board helps for BibleQuest Arcade. Answers and explanations are always free.",
};

export default function ArcadeStorePage() {
  if (!GREEN_FEATURES.games) notFound();

  return (
    <>
      <PageHeader
        title="Arcade Store"
        subtitle="More days to play, and helps for the board."
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
