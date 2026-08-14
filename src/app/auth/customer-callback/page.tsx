import { CustomerAuthCallback } from "@/components/account/CustomerAuthCallback";

export const dynamic = "force-dynamic";

/** Renders no credential server-side; the authorization code lives in a fragment. */
export default function CustomerCallbackPage() {
  return <CustomerAuthCallback />;
}
