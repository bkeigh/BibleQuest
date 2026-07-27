import "server-only";

import { headers } from "next/headers";
import { isConsoleRequestHost } from "@/lib/console/paths";

/** Resolves whether this request uses the clean dedicated console hostname. */
export async function usesCleanConsoleUrls() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-biblequest-console-host") === "1" ||
    isConsoleRequestHost(
      requestHeaders.get("host"),
      requestHeaders.get("x-forwarded-host"),
    )
  );
}
