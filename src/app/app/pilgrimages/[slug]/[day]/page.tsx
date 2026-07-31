import { notFound } from "next/navigation";
import { PilgrimageDay } from "@/components/guided/PilgrimageDay";
import {
  pilgrimageBySlug,
  pilgrimages,
} from "@/data/guided/content";
import { GREEN_FEATURES } from "@/lib/features/green";
import { privateRouteMetadata } from "@/lib/metadata";

export function generateStaticParams() {
  return pilgrimages.flatMap((pilgrimage) =>
    pilgrimage.days.map((_, index) => ({
      slug: pilgrimage.slug,
      day: String(index + 1),
    })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; day: string }>;
}) {
  const { slug, day } = await params;
  const pilgrimage = pilgrimageBySlug.get(slug);
  const dayNumber = Number(day);
  const practice =
    Number.isSafeInteger(dayNumber) && dayNumber > 0
      ? pilgrimage?.days[dayNumber - 1]
      : undefined;
  return practice && pilgrimage
    ? privateRouteMetadata(
        `${pilgrimage.title}: ${practice.title}`,
        `/app/pilgrimages/${pilgrimage.slug}/${dayNumber}`,
      )
    : {};
}

/** Resolves an exact reviewed day; arbitrary indices never reach the client. */
export default async function PilgrimageDayPage({
  params,
}: {
  params: Promise<{ slug: string; day: string }>;
}) {
  if (!GREEN_FEATURES.pilgrimages) notFound();
  const { slug, day } = await params;
  const pilgrimage = pilgrimageBySlug.get(slug);
  const dayNumber = Number(day);
  const practice =
    Number.isSafeInteger(dayNumber) && dayNumber > 0
      ? pilgrimage?.days[dayNumber - 1]
      : undefined;
  if (!pilgrimage || !practice) notFound();
  return (
    <PilgrimageDay
      pilgrimage={pilgrimage}
      practice={practice}
      dayNumber={dayNumber}
    />
  );
}
