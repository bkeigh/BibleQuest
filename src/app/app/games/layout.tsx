import { AccountGate } from "@/components/app-shell/AccountGate";

/**
 * Gates BibleQuest Arcade at the layout rather than the page.
 *
 * A per-page wrap gates whatever pages existed the day it was written; this
 * covers every arcade route, including ones added later. The gate
 * is inert unless account sync is live — see `lib/features/account-gate.ts`.
 */
export default function GamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountGate surface="games">{children}</AccountGate>;
}
