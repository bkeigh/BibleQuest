import { PixelIcon } from "@/components/design-system/PixelIcon";
import { GentleLink } from "@/components/design-system/GentleButton";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-parchment px-6 text-center">
      <PixelIcon name="candle" size={8} animate />
      <h1 className="mt-6 font-display text-[1.75rem] text-graphite">
        You’re offline
      </h1>
      <p className="mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ash">
        Saved pages and your drafts are still here. New quests and verses will
        return when you reconnect.
      </p>
      <GentleLink variant="outline" href="/app" className="mt-6">
        Return home
      </GentleLink>
    </div>
  );
}
