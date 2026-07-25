import { AccountScreen } from "@/components/account/AccountScreen";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata = privateRouteMetadata("Account", "/app/account");

export default function AccountPage() {
  return <AccountScreen />;
}
