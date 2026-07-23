import type { Metadata } from "next";

const SOCIAL_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "BibleQuest, a daily guide to living your faith",
};

// Keeps canonical and social metadata consistent across public content pages.
export function marketingMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: `/${string}` | "/";
}): Metadata {
  const socialTitle = `${title} — BibleQuest`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description,
      url: path,
      siteName: "BibleQuest",
      type: "website",
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [SOCIAL_IMAGE.url],
    },
  };
}

// Private app routes can have a useful title and canonical without entering search.
export function privateRouteMetadata(
  title: string,
  path: `/${string}`,
): Metadata {
  return {
    title,
    alternates: { canonical: path },
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
    openGraph: null,
    twitter: null,
  };
}

// The app layout applies this fail-closed indexing policy to every nested screen.
export const PRIVATE_APP_METADATA: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
  openGraph: null,
  twitter: null,
};
