import type { Metadata } from "next";
import { GamesScreen } from "@/components/games/GamesScreen";

export const metadata: Metadata = {
  title: "Scripture Games",
  description:
    "A calm daily Scripture Connections or Bible Timeline study with sourced explanations.",
};

/** Route stays thin; deterministic selection and play live in the game modules. */
export default function GamesPage() {
  return <GamesScreen />;
}
