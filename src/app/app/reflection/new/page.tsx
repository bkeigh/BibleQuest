import { Suspense } from "react";
import { ReflectionComposer } from "@/components/reflection/ReflectionComposer";

export const metadata = { title: "A reflection" };

export default function NewReflectionPage() {
  return (
    <Suspense>
      <ReflectionComposer />
    </Suspense>
  );
}
