import type { ReactNode } from "react";
import { isNativeTarget } from "@/lib/platform/target";

/** Removes acquisition and external-billing entry points from App Store builds. */
export function WebCommerceOnly({ children }: { children: ReactNode }) {
  if (isNativeTarget()) return null;
  return <>{children}</>;
}
