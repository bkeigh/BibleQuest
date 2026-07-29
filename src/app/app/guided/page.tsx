import { notFound } from "next/navigation";
import { GuidedHub } from "@/components/guided/GuidedHub";
import { GREEN_FEATURES } from "@/lib/features/green";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata = privateRouteMetadata(
  "Guided Scripture",
  "/app/guided",
);

/** The build-time kill switch removes the whole guided entry route. */
export default function GuidedPage() {
  if (!GREEN_FEATURES.guidedScripture) notFound();
  return <GuidedHub />;
}
