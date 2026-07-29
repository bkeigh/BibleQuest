import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import { RhythmBuilder } from "@/components/rhythm/RhythmBuilder";
import { GREEN_FEATURES } from "@/lib/features/green";

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
