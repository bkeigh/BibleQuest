import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/app-shell/ServiceWorkerRegistrar";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://biblequest.co"
  ),
  title: {
    default: "BibleQuest — One Meaningful Step with God Today",
    template: "%s — BibleQuest",
  },
  description:
    "BibleQuest helps Christians build a peaceful daily rhythm of Scripture, prayer, reflection, and real-life quests. One verse, one prayer, one quest — one step closer to God today.",
  applicationName: "BibleQuest",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BibleQuest",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "BibleQuest — One Meaningful Step with God Today",
    description:
      "A peaceful daily rhythm of Scripture, prayer, reflection, and small acts of faith. Not a streak. A pilgrimage.",
    url: "/",
    siteName: "BibleQuest",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BibleQuest — One Meaningful Step with God Today",
    description:
      "A peaceful daily rhythm of Scripture, prayer, reflection, and small acts of faith.",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#fefffc",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-parchment text-charcoal">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
