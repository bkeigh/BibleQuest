import { FloatingNav } from "@/components/marketing/FloatingNav";
import { Footer } from "@/components/marketing/Footer";
import { MarketingMotion } from "@/components/marketing/MarketingMotion";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingMotion>
      <div className="flex min-h-dvh flex-col bg-parchment">
        {/* Keep the keyboard-only escape hatch below a notched device's
            status area when it becomes visible. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))] focus:z-[60] focus:rounded-[var(--radius-button)] focus:border focus:border-mist focus:bg-paper focus:px-4 focus:py-2 focus:text-charcoal"
        >
          Skip to content
        </a>
        <FloatingNav />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </MarketingMotion>
  );
}
