import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { SupportCheckout } from "@/components/plus/SupportCheckout";
import { stripeSupportAvailability } from "@/lib/support/server";
import { marketingMetadata } from "@/lib/metadata";

export const metadata = marketingMetadata({
  title: "Support BibleQuest",
  description:
    "Offer voluntary one-time support while Scripture, prayer, reflection, and essential quests stay free.",
  path: "/support",
});

export const dynamic = "force-dynamic";

/** Renders return copy without treating its query parameter as payment proof. */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string | string[] }>;
}) {
  const availability = stripeSupportAvailability();
  const checkout = (await searchParams).checkout;
  const returnNotice =
    checkout === "returned" || checkout === "cancelled" ? checkout : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-24 pt-32 sm:px-8">
      <div className="flex items-center gap-2 text-caption uppercase tracking-[0.14em] text-accent">
        <PixelIcon name="service-basket" size={36} /> Support BibleQuest
      </div>
      <h1 className="mt-2 font-display text-heading text-graphite sm:text-heading-lg">
        Help keep the essentials free.
      </h1>
      <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-charcoal">
        One-time support helps sustain BibleQuest without putting Scripture,
        prayer, reflection, or meaningful action behind a paywall. It never
        changes spiritual standing or unlocks spiritual rewards.
      </p>

      <PaperCard variant="atmospheric" padding="lg" className="mt-8">
        <SupportCheckout
          enabled={availability.enabled}
          mode={availability.mode}
          returnNotice={returnNotice}
        />
      </PaperCard>

      <p className="mt-5 text-caption leading-relaxed text-ash">
        BibleQuest Plus is a separate optional recurring membership. One-time
        support here does not create or modify a Plus subscription.
      </p>
    </div>
  );
}
