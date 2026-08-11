import type { Metadata } from "next";
import { HostedCheckoutReturn } from "@/components/marketing/HostedCheckoutReturn";

export const metadata: Metadata = {
  title: "Return to BibleQuest",
  robots: { index: false, follow: false },
};

/** Fixed success destination; the path is a hint and never an entitlement. */
export default function CheckoutReturnedPage() {
  return <HostedCheckoutReturn hint="returned" />;
}
