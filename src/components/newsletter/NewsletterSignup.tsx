import { PaperCard } from "@/components/design-system/PaperCard";
import { ArtIcon } from "@/components/design-system/ArtIcon";
import {
  TALLY_NEWSLETTER_EMBED_URL,
  TALLY_NEWSLETTER_URL,
} from "@/lib/newsletter";

/** Public newsletter form shared by marketing links and the in-app invitation. */
export function NewsletterSignup() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mx-auto mb-8 max-w-2xl text-center">
        <ArtIcon name="scroll" size={104} className="mx-auto mb-5" />
        <p className="font-art-label text-caption uppercase tracking-[0.16em] text-accent">
          Stay connected
        </p>
        <h2 className="mt-3 font-display text-editorial text-graphite sm:text-heading">
          Join the BibleQuest newsletter
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ash">
          Receive thoughtful product updates, new ways to practice your faith,
          and occasional notes from the BibleQuest journey.
        </p>
      </header>

      <PaperCard
        as="section"
        variant="atmospheric"
        padding="none"
        className="overflow-hidden"
        aria-label="BibleQuest newsletter signup"
      >
        <iframe
          src={TALLY_NEWSLETTER_EMBED_URL}
          title="Join the BibleQuest newsletter"
          loading="lazy"
          sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
          referrerPolicy="no-referrer"
          width="100%"
          height="640"
          className="block w-full border-0 bg-transparent"
        />
        <p className="border-t border-mist bg-linen/70 px-4 py-3 text-center text-caption text-ash">
          Having trouble with the form?{" "}
          <a
            href={TALLY_NEWSLETTER_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Open the newsletter signup in a new tab
          </a>
          .
        </p>
      </PaperCard>
    </div>
  );
}
