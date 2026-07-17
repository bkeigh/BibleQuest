"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WaitlistGate } from "@/components/marketing/WaitlistGate";
import { isPreviewGatePath } from "@/lib/preview-gate";

interface MarketingGateRouterProps {
  children: ReactNode;
}

/** Gates the root landing experience without blocking legal/support pages. */
export function MarketingGateRouter({ children }: MarketingGateRouterProps) {
  const pathname = usePathname();

  if (isPreviewGatePath(pathname)) {
    return <WaitlistGate>{children}</WaitlistGate>;
  }

  return <>{children}</>;
}
