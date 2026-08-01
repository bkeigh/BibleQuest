import { AccountGate } from "@/components/app-shell/AccountGate";

/**
 * Gates quests at the layout rather than the page.
 *
 * A per-page wrap gates whatever pages existed the day it was written; this
 * covers every quest route, including ones added later. The gate
 * is inert unless account sync is live — see `lib/features/account-gate.ts`.
 */
export default function QuestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccountGate surface="quests">{children}</AccountGate>;
}
