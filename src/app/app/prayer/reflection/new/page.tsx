import { Suspense } from "react";
import { ReflectionComposer } from "@/components/reflection/ReflectionComposer";
import { ShellSkeleton } from "@/components/app-shell/ShellSkeleton";

export const metadata = { title: "New Reflection" };

export default function NewReflectionPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ReflectionComposer />
    </Suspense>
  );
}
