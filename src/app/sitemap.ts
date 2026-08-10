import type { MetadataRoute } from "next";

const APP_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? "https://www.biblequest.co",
).origin;

const PUBLIC_ROUTES = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
  { path: "/support", priority: 0.6, changeFrequency: "monthly" },
  { path: "/churches", priority: 0.6, changeFrequency: "monthly" },
  { path: "/writing", priority: 0.5, changeFrequency: "weekly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
] as const;

// Lists stable marketing pages only; private and user-generated routes stay excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${APP_ORIGIN}${path}`,
    priority,
    changeFrequency,
  }));
}
