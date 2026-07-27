import type { Metadata } from "next";
import { PRIVATE_APP_METADATA } from "@/lib/metadata";

export const metadata: Metadata = {
  ...PRIVATE_APP_METADATA,
  title: "Console",
  description: "Private BibleQuest operations console.",
  manifest: null,
};

/** Applies the private indexing boundary to every console route. */
export default function ConsoleRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
