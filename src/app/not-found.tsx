import type { Metadata } from "next";
import Image from "next/image";
import { GentleLink } from "@/components/design-system/GentleButton";
import { PixelMascot } from "@/components/design-system/PixelMascot";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-parchment px-6 py-16 text-center">
      <Image
        src="/brand/bq-logo.svg"
        alt="BibleQuest"
        width={35}
        height={44}
        className="mb-6 h-11 w-auto"
      />
      <PixelMascot name="map" size={192} />
      <p className="mt-5 text-caption uppercase tracking-[0.16em] text-accent">
        Path not found
      </p>
      <h1 className="mt-2 font-display text-editorial text-graphite sm:text-heading">
        This trail ends here.
      </h1>
      <p className="mt-3 max-w-sm text-small leading-relaxed text-ash">
        The page may have moved, but your next step is still close.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <GentleLink variant="primary" href="/">
          Return home
        </GentleLink>
        <GentleLink variant="outline" href="/app">
          Open BibleQuest
        </GentleLink>
      </div>
    </main>
  );
}
