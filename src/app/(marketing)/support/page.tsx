import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import { isStripeDonationConfigured } from "@/lib/support/server";

export const metadata = {
  title: "Support BibleQuest",
  description:
    "Help keep BibleQuest's Scripture, prayer, reflection, and essential quests free for everyone.",
};

export const dynamic = "force-dynamic";

export default function SupportPage() {
  const configured = isStripeDonationConfigured();

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-24 pt-32 sm:px-8">
      <div className="flex items-center gap-2 text-caption uppercase tracking-[0.14em] text-accent">
        <PixelIcon name="heart" size={3} /> Support BibleQuest
      </div>
      <h1 className="mt-2 font-display text-heading text-graphite sm:text-heading-lg">
        Help keep the essentials free.
      </h1>
      <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-charcoal">
        A one-time gift helps sustain BibleQuest without putting Scripture,
        prayer, reflection, or meaningful action behind a paywall. Donations
        never change anyone’s spiritual standing or unlock spiritual rewards.
      </p>

      <PaperCard variant="atmospheric" padding="lg" className="mt-8">
        {configured ? (
          <>
            <h2 className="font-display text-[1.375rem] text-graphite">
              Give securely through Stripe
            </h2>
            <p className="mt-2 text-small leading-relaxed text-charcoal">
              The next step opens BibleQuest’s hosted Stripe checkout. Stripe
              handles payment details; BibleQuest does not collect card numbers.
            </p>
            <GentleLink
              variant="gold"
              size="lg"
              href="/api/support/checkout"
              prefetch={false}
              className="mt-5"
            >
              Continue to secure donation
            </GentleLink>
          </>
        ) : (
          <div role="status">
            <h2 className="font-display text-[1.375rem] text-graphite">
              Donations are temporarily unavailable
            </h2>
            <p className="mt-2 text-small leading-relaxed text-charcoal">
              The secure Stripe destination has not been configured for this
              deployment. No payment control is shown, and no information has
              been sent anywhere.
            </p>
            <GentleLink variant="text" href="/" className="mt-4">
              Return to BibleQuest
            </GentleLink>
          </div>
        )}
      </PaperCard>

      <p className="mt-5 text-caption leading-relaxed text-ash">
        BibleQuest Plus is a separate optional membership. A donation here does
        not create or modify a Plus subscription.
      </p>
    </div>
  );
}
