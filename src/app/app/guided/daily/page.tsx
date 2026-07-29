import { notFound } from "next/navigation";
import { DailyGuidedPractice } from "@/components/guided/DailyGuidedPractice";
import { GREEN_FEATURES } from "@/lib/features/green";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata = privateRouteMetadata(
  "Today’s Guided Scripture",
  "/app/guided/daily",
);

/** Daily content still obeys the independent guided-Scripture kill switch. */
export default function DailyGuidedPage() {
  if (!GREEN_FEATURES.guidedScripture) notFound();
  return <DailyGuidedPractice />;
}
