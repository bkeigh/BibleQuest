import type { Metadata } from "next";
import { GamesScreen } from "@/components/games/GamesScreen";

export const metadata: Metadata = {
  title: "BibleQuest Arcade",
  description:
    "Play through Scripture in BibleQuest Arcade: a match-three journey, a daily study, and sourced explanations for every answer.",
};

/** Route stays thin; deterministic selection and play live in the game modules. */
export default function GamesPage() {
  return <GamesScreen />;
}
