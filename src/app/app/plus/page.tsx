import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PlusContent } from "@/components/plus/PlusContent";

export const metadata = { title: "Plus" };

export default function PlusPage() {
  return (
    <>
      <PageHeader title="Plus & Patron" subtitle="Free stays whole. Plus goes deeper." />
      <PageContainer className="pb-8">
        <PlusContent />
      </PageContainer>
    </>
  );
}
