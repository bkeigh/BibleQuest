import { ArtMascot } from "@/components/design-system/ArtMascot";
import { Ring } from "@/components/loading-ui/ring";

interface AppLoadingScreenProps {
  label?: string;
}

/** Keeps startup branded while exposing a quiet loading status to assistive tech. */
export function AppLoadingScreen({
  label = "Restoring your journey",
}: AppLoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-parchment px-6"
    >
      <ArtMascot name="open-book" size={256} priority />
      {/* Decorative: this surface already announces the wait once, below. */}
      <Ring className="size-8" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
