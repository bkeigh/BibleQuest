import { notFound } from "next/navigation";
import { PilgrimageDetail } from "@/components/guided/PilgrimageDetail";
import {
  pilgrimageBySlug,
  pilgrimages,
} from "@/data/guided/content";
import { GREEN_FEATURES } from "@/lib/features/green";
import { privateRouteMetadata } from "@/lib/metadata";

export function generateStaticParams() {
  return pilgrimages.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pilgrimage = pilgrimageBySlug.get(slug);
  return pilgrimage
    ? privateRouteMetadata(
        pilgrimage.title,
        `/app/pilgrimages/${pilgrimage.slug}`,
      )
    : {};
}

/** Only reviewed catalogue slugs produce a path page. */
export default async function PilgrimagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!GREEN_FEATURES.pilgrimages) notFound();
  const { slug } = await params;
  const pilgrimage = pilgrimageBySlug.get(slug);
  if (!pilgrimage) notFound();
  return <PilgrimageDetail pilgrimage={pilgrimage} />;
}
