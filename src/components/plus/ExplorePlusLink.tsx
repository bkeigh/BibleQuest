"use client";

import { usePlus } from "@/lib/revenuecat/usePlus";
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

  return (
    <PlusInvitationLink
      title={isPlus ? "Plus is active" : "Explore Plus"}
      description={isPlus ? memberDescription : description}
      href="/app/plus"
      className={className}
    />
  );
}
