import { notFound } from "next/navigation";
import { PilgrimageCatalog } from "@/components/guided/PilgrimageCatalog";
import { GREEN_FEATURES } from "@/lib/features/green";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata = privateRouteMetadata("Pilgrimages", "/app/pilgrimages");

/** The catalogue can be disabled without changing stored progress. */
export default function PilgrimagesPage() {
  if (!GREEN_FEATURES.pilgrimages) notFound();
  return <PilgrimageCatalog />;
}
