import type { MetadataRoute } from "next";

const APP_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? "https://www.biblequest.co",
).origin;

// Search engines may index public guidance, but never app, auth, or API surfaces.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/onboarding", "/offline", "/auth", "/api"],
    },
    sitemap: `${APP_ORIGIN}/sitemap.xml`,
    host: APP_ORIGIN,
  };
}
