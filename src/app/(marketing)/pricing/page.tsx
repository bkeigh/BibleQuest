import { PlusContent } from "@/components/plus/PlusContent";
import { Eyebrow } from "@/components/design-system/EditorialSection";
import { GentleLink } from "@/components/design-system/GentleButton";

export const metadata = {
  title: "Pricing",
  description:
    "BibleQuest is free for everything that matters — Scripture, prayer, reflection, quests, and your journey. Plus deepens the experience without gatekeeping God.",
};

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-32 sm:px-8">
      <div className="text-center">
        <Eyebrow>Simple and honest</Eyebrow>
        <h1 className="font-display text-[2.25rem] leading-tight text-graphite sm:text-[2.75rem]">
          Free for the essentials
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[1.125rem] leading-relaxed text-ash">
          Your relationship with God is never behind a paywall. Plus adds depth
          and helps keep BibleQuest going.
        </p>
      </div>

      <div className="mt-12">
        <PlusContent />
      </div>

      <div className="mt-10 text-center">
        <GentleLink variant="dark" size="lg" href="/onboarding">
          Begin free
        </GentleLink>
      </div>
    </div>
  );
}
