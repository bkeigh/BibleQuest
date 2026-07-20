import { Suspense } from "react";
import { PrayerComposer } from "@/components/prayer/PrayerComposer";

export const metadata = { title: "New Prayer" };

export default function NewPrayerPage() {
  return (
    <Suspense>
      <PrayerComposer />
    </Suspense>
  );
}
