import { ArtIcon } from "@/components/design-system/ArtIcon";
import { GentleLink } from "@/components/design-system/GentleButton";
import { errors } from "@/lib/questos/copy";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata = privateRouteMetadata("Offline", "/offline");

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-parchment px-6 text-center">
      <ArtIcon name="candle" size={120} animate />
      <h1 className="mt-6 font-display text-editorial text-graphite">
        No connection
      </h1>
      <p className="mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ash">
        {errors.offline}
      </p>
      <GentleLink variant="outline" href="/app" className="mt-6">
        Return home
      </GentleLink>
    </div>
  );
}
