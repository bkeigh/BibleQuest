import { notFound } from "next/navigation";
import { ArchiveGameScreen } from "@/components/games/ArchiveGameScreen";
import { gamePuzzleById, gamePuzzles } from "@/data/games";
import { GREEN_FEATURES } from "@/lib/features/green";

export function generateStaticParams() {
  return gamePuzzles.map((puzzle) => ({ puzzle: puzzle.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ puzzle: string }>;
}) {
  const { puzzle: puzzleId } = await params;
  return { title: gamePuzzleById.get(puzzleId)?.title ?? "Archive Study" };
}

export default async function ArchivedGamePage({
  params,
}: {
  params: Promise<{ puzzle: string }>;
}) {
  const { puzzle: puzzleId } = await params;
  const puzzle = gamePuzzleById.get(puzzleId);
  if (!puzzle) notFound();
  if (
    !GREEN_FEATURES.games ||
    (puzzle.kind === "connections"
      ? !GREEN_FEATURES.scriptureConnections
      : !GREEN_FEATURES.bibleTimeline)
  ) {
    notFound();
  }
  return <ArchiveGameScreen puzzle={puzzle} />;
}
