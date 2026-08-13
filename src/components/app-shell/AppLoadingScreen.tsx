import { ArtMascot } from "@/components/design-system/ArtMascot";

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
      className="flex min-h-dvh items-center justify-center bg-parchment px-6"
    >
      <ArtMascot name="open-book" size={256} priority />
      <span className="sr-only">{label}</span>
    </div>
  );
}
