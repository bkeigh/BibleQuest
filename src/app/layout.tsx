import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/app-shell/ServiceWorkerRegistrar";
import { JournalDraftJanitor } from "@/components/journal/JournalDraftJanitor";
import { APPEARANCE_BOOTSTRAP_SCRIPT } from "@/lib/appearance/bootstrap";
import { deploymentLabel } from "@/lib/deployment-label";

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
    process.env.NEXT_PUBLIC_APP_URL ?? "https://www.biblequest.co"
  ),
  title: {
    default: "BibleQuest — A daily guide to living your faith",
    template: "%s — BibleQuest",
  },
  description:
    "Read Scripture, pray, reflect, and put faith into action with daily verses, private prayer journaling, real-life quests, and a journey that grows with you.",
  applicationName: "BibleQuest",
  category: "Faith and spirituality",
  keywords: [
    "Bible app",
    "daily Bible verse",
    "Christian prayer app",
    "faith journal",
    "Christian daily devotional",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BibleQuest",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "BibleQuest — A daily guide to living your faith",
    description:
      "Read Scripture, pray, reflect, and put faith into action with a gentle daily rhythm that grows with you.",
    url: "/",
    siteName: "BibleQuest",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "BibleQuest, a daily guide to living your faith",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BibleQuest — A daily guide to living your faith",
    description:
      "Read Scripture, pray, reflect, and put faith into action with a gentle daily rhythm that grows with you.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      {
        url: "/icons/favicon-48.png?v=2",
        sizes: "48x48",
        type: "image/png",
      },
      { url: "/icons/icon.svg?v=2", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: ["/icons/favicon-48.png?v=2"],
    apple: [{ url: "/icons/apple-touch-icon.png?v=2", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#faf6ec",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Makes isolated sync staging visibly impossible to mistake for Production.
  const stagingLabel = deploymentLabel(
    process.env.BIBLEQUEST_DEPLOYMENT_LABEL
  );

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${fraunces.variable} ${inter.variable} glass-surfaces h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies saved appearance before painted content can flash or animate. */}
        <script
          dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-parchment text-charcoal">
        {stagingLabel ? (
          <div
            role="status"
            className="sticky top-0 z-[100] border-b border-gold-700 bg-dusk px-3 py-2 text-center font-art-label text-xs tracking-[0.12em] text-gold-100"
          >
            {stagingLabel}
          </div>
        ) : null}
        {children}
        <JournalDraftJanitor />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
