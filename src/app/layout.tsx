import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import localFont from "next/font/local";
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

/* Ithaca (SIL OFL 1.1, by GGBotNet) — the pixel accent voice.
   Used only for quest labels, badges, unlocks, tiny decorative headings. */
const ithaca = localFont({
  src: "../fonts/Ithaca.ttf",
  variable: "--font-ithaca",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://biblequest.co"
  ),
  title: {
    default: "BibleQuest — Scripture, prayer, and real-life quests",
    template: "%s — BibleQuest",
  },
  description:
    "One verse, one prayer, one quest a day. BibleQuest is a calm way to actually live your faith. Not a streak. A pilgrimage.",
  applicationName: "BibleQuest",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BibleQuest",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "BibleQuest — Scripture, prayer, and real-life quests",
    description:
      "One verse, one prayer, one quest a day. A calm way to actually live your faith. Not a streak. A pilgrimage.",
    url: "/",
    siteName: "BibleQuest",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BibleQuest — Scripture, prayer, and real-life quests",
    description:
      "One verse, one prayer, one quest a day. A calm way to actually live your faith.",
    images: ["/og.png"],
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
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${ithaca.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-parchment text-charcoal">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
