import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GamesArchiveScreen } from "@/components/games/GamesArchiveScreen";
import { GREEN_FEATURES } from "@/lib/features/green";

export const metadata: Metadata = {
  title: "Game Archive",
  description: "Optional Scripture game archives and themed studies.",
};

export default function GamesArchivePage() {
  // Keep disabled release slices out of the rendered route and page payload.
  if (!GREEN_FEATURES.games) notFound();
  return <GamesArchiveScreen />;
}
