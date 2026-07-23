import { PlusContent } from "@/components/plus/PlusContent";
import { Eyebrow } from "@/components/design-system/EditorialSection";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PlusProvider } from "@/lib/revenuecat/usePlus";
import { marketingMetadata } from "@/lib/metadata";

export const metadata = marketingMetadata({
  title: "Pricing",
  description:
    "BibleQuest is free for everything that matters — Scripture, prayer, reflection, quests, and your journey. Plus is coming later and adds depth, never access.",
  path: "/pricing",
});

export default function PricingPage() {
  // Marketing lives outside the persistent app provider, so pricing owns one
  // entitlement coordinator for its purchase/management controls.
  return (
    <PlusProvider>
      <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-32 sm:px-8">
        <div className="text-center">
          <Eyebrow>Pricing, plainly</Eyebrow>
          <h1 className="font-display text-heading text-graphite sm:text-heading-lg">
            Free is the product.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[1.125rem] leading-relaxed text-ash">
            Everything BibleQuest does today is free. Plus arrives later — it
            adds depth, never access. Your relationship with God is never behind
            a paywall.
          </p>
        </div>

        <div className="mt-12">
          <PlusContent />
        </div>

        <div className="mt-10 text-center">
          <GentleLink variant="primary" size="lg" href="/onboarding">
            Start free
          </GentleLink>
        </div>
      </div>
    </PlusProvider>
  );
}
