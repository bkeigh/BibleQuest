"use client";

import type { GatedSurface } from "@/lib/features/account-gate";

/** Leaves local journey surfaces open when remote identity is not shipped. */
export function AccountGate({
  children,
}: {
  surface: GatedSurface;
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
