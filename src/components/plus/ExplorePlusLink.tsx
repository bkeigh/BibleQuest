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
  const { isPlus } = usePlus();

  // Plus cannot be obtained on iOS until a StoreKit path exists, so an
  // invitation here would lead somewhere the user can never act on — and App
  // Store guideline 3.1.1 forbids steering people to an outside purchase.
  if (isNativeTarget()) return null;

  return (
    <PlusInvitationLink
      title={isPlus ? "Plus is active" : "Explore Plus"}
      description={isPlus ? memberDescription : description}
      href="/app/plus"
      className={className}
    />
  );
}
