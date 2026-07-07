import { notFound } from "next/navigation";
import { seedQuests, questBySlug } from "@/data/seed/quests";
import { QuestDetail } from "@/components/quests/QuestDetail";

export function generateStaticParams() {
  return seedQuests.map((q) => ({ slug: q.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const quest = questBySlug.get(slug);
  return { title: quest?.title ?? "Quest" };
}

export default async function QuestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const quest = questBySlug.get(slug);
  if (!quest) notFound();
  return <QuestDetail quest={quest} />;
}
