import Link from "next/link";
import { PixelIcon } from "@/components/design-system/PixelIcon";

export function Footer() {
  return (
    <footer className="border-t border-mist bg-linen">
      <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2">
              <PixelIcon name="candle" size={5} />
              <span className="font-display text-[1.25rem] text-graphite">
                BibleQuest
              </span>
            </Link>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ash">
              A peaceful daily rhythm of Scripture, prayer, reflection, and small
              acts of faith. One meaningful step with God today.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-[0.9375rem] sm:grid-cols-3">
            <FooterCol title="Product">
              <FooterLink href="/#how">How it works</FooterLink>
              <FooterLink href="/pricing">Pricing</FooterLink>
              <FooterLink href="/onboarding">Get BibleQuest</FooterLink>
            </FooterCol>
            <FooterCol title="More">
              <FooterLink href="/about">About</FooterLink>
              <FooterLink href="/writing">Writing</FooterLink>
              <FooterLink href="/churches">Churches</FooterLink>
            </FooterCol>
            <FooterCol title="Legal">
              <FooterLink href="/privacy">Privacy</FooterLink>
              <FooterLink href="/terms">Terms</FooterLink>
            </FooterCol>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-mist pt-6 text-[0.8125rem] text-fog sm:flex-row sm:items-center sm:justify-between">
          <p>Scripture: World English Bible · Public Domain.</p>
          <p>Built with care. Not a replacement for church or community.</p>
        </div>
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
      <p className="mb-1 text-[0.75rem] uppercase tracking-wide text-olive-500">
        {title}
      </p>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-ash transition-colors hover:text-olive-700">
      {children}
    </Link>
  );
}
