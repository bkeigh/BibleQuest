import { redirect } from "next/navigation";

export const metadata = { title: "A reflection" };

type LegacyReflectionComposerPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewReflectionPage({
  searchParams,
}: LegacyReflectionComposerPageProps) {
  const incoming = await searchParams;
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(incoming)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  redirect(`/app/prayer/reflection/new${query ? `?${query}` : ""}`);
}
