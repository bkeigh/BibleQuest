import { HomeScreen } from "@/components/home/HomeScreen";
import { privateRouteMetadata } from "@/lib/metadata";

export const metadata = privateRouteMetadata("Home", "/app");

export default function HomePage() {
  return <HomeScreen />;
}
