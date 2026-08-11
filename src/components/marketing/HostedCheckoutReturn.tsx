import Link from "next/link";
import {
  CHECKOUT_APP_LINKS,
  type CheckoutReturnHint,
} from "@/lib/billing/checkout-return";

/** Gives Safari a calm, identifier-free route back to native or web Plus. */
export function HostedCheckoutReturn({
  hint,
}: {
  hint: CheckoutReturnHint;
}) {
  const returned = hint === "returned";
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-black/10 bg-white/70 p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gilt">
          BibleQuest Plus
        </p>
        <h1 className="mt-3 font-serif text-3xl text-charcoal">
          {returned ? "Welcome back" : "Checkout closed"}
        </h1>
        <p className="mt-4 leading-relaxed text-ash">
          {returned
            ? "Returning from checkout does not confirm payment or Plus. BibleQuest checks the protected server record after the app opens."
            : "No membership change is assumed from closing checkout. Your BibleQuest journey and free experience are unchanged."}
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <a
            href={CHECKOUT_APP_LINKS[hint]}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
          >
            Return to the BibleQuest app
          </a>
          <Link
            href={`/app/plus?checkout=${hint}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-black/15 px-5 py-3 text-sm font-semibold text-charcoal"
          >
            Continue on the website
          </Link>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-ash">
          If the app does not open, return to BibleQuest yourself and use
          “Check membership again.” Do not share checkout links.
        </p>
      </section>
    </main>
  );
}
