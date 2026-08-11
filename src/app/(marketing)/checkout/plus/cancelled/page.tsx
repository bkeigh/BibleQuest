import type { Metadata } from "next";
import { HostedCheckoutReturn } from "@/components/marketing/HostedCheckoutReturn";

export const metadata: Metadata = {
  title: "Checkout closed · BibleQuest",
  robots: { index: false, follow: false },
};

/** Fixed cancellation destination; it does not mutate billing or access. */
export default function CheckoutCancelledPage() {
  return <HostedCheckoutReturn hint="cancelled" />;
}
