import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import { RhythmBuilder } from "@/components/rhythm/RhythmBuilder";
import { GREEN_FEATURES } from "@/lib/features/green";

export const metadata: Metadata = {
  title: "My Rhythm",
  description:
    "Build a gentle weekly formation plan that never scores missed days.",
};

export default function RhythmPage() {
  if (!GREEN_FEATURES.rhythmBuilder) notFound();

  return (
    <>
      <PageHeader
        title="My Rhythm"
        subtitle="A gentle plan for returning—never a score."
      />
      <PageContainer className="pb-8">
        <RhythmBuilder />
      </PageContainer>
    </>
  );
}
