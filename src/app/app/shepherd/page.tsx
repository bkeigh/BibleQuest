import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import { MyShepherd } from "@/components/shepherd/MyShepherd";

export const metadata = { title: "MyShepherd" };

export default function MyShepherdPage() {
  return (
    <>
      <PageHeader
        title="MyShepherd"
        subtitle="A humble companion for Scripture questions."
      />
      <PageContainer className="pb-8 pt-4">
        <MyShepherd />
      </PageContainer>
    </>
  );
}
