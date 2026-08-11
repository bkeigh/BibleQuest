"use client";

import { usePlus } from "@/lib/billing/usePlus";
import { isNativeTarget } from "@/lib/platform/target";
import { PlusInvitationLink } from "./PlusInvitationLink";

interface ExplorePlusLinkProps {
  className?: string;
  description?: string;
  memberDescription?: string;
}

/** Full-width gold invitation that mirrors Home's primary verse card. */
export function ExplorePlusLink({
  className,
  description = "Unlock every wallpaper, unlimited verse refreshes, and more room for daily quests.",
  memberDescription = "Every wallpaper, unlimited verse refreshes, and unlimited quest windows are ready.",
}: ExplorePlusLinkProps) {
  const { canManage, canPurchase, isPlus } = usePlus();

  // Native acquisition remains absent until the verified account and fresh US
  // storefront gate make the retained account-beta Plus route actionable.
  if (isNativeTarget() && !isPlus && !canPurchase && !canManage) return null;

  return (
    <PlusInvitationLink
      title={isPlus ? "Plus is active" : "Explore Plus"}
      description={isPlus ? memberDescription : description}
      href="/app/plus"
      className={className}
    />
  );
}
