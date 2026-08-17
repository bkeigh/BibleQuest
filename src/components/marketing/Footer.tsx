import Link from "next/link";
import Image from "next/image";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="border-t border-mist bg-linen">
      <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2.5">
              <Image
                src="/brand/bq-logo.svg"
                alt=""
                width={22}
                height={28}
                className="h-[26px] w-auto"
              />
              <span className="font-display text-[1.25rem] text-graphite">
                BibleQuest
              </span>
            </Link>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ash">
              Scripture, prayer, and small quests you choose. Built to help you
              live your faith, not scroll it.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-[0.9375rem] sm:grid-cols-3">
            <FooterCol title="Product">
              <FooterLink href="/#how">How it works</FooterLink>
              <FooterLink href="/pricing">Pricing</FooterLink>
              <FooterLink href="/onboarding">Open BibleQuest</FooterLink>
            </FooterCol>
            <FooterCol title="More">
              <FooterLink href="/about">About</FooterLink>
              <FooterLink href="/writing">Writing</FooterLink>
              <FooterLink href="/churches">Churches</FooterLink>
              <FooterLink href="/contact">Contact</FooterLink>
            </FooterCol>
            <FooterCol title="Legal">
              <FooterLink href="/privacy">Privacy</FooterLink>
              <FooterLink href="/terms">Terms of Use</FooterLink>
            </FooterCol>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-mist pt-6 text-[0.8125rem] text-ash sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} BibleQuest ·{" "}
            <a
              href={SUPPORT_EMAIL_HREF}
              className="transition-colors hover:text-accent"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p>WEB bundled offline · Online editions attributed in context.</p>
        </div>
        <p className="mt-2 text-[0.8125rem] text-ash">
          Built with care. Not a replacement for church or community.
        </p>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="mb-1 text-[0.75rem] uppercase tracking-wide text-accent">
        {title}
      </p>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-ash transition-colors hover:text-accent">
      {children}
    </Link>
  );
}
