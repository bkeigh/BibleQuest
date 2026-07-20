import { redirect } from "next/navigation";

export const metadata = { title: "Reflections" };

export default function ReflectionPage() {
  redirect("/app/prayer/reflections");
}
