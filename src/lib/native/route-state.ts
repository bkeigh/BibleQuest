import { isNativeTarget } from "@/lib/platform/target";
import { useQuestOS } from "@/lib/questos/store";

/** Refresh the canonical local snapshot when a cached native route resumes. */
export async function rehydrateNativeRouteState(
  nativeTarget = isNativeTarget(),
  rehydrate: () => void | Promise<void> = () =>
    useQuestOS.persist.rehydrate(),
): Promise<void> {
  if (!nativeTarget) return;
  try {
    await rehydrate();
  } catch {
    // The mounted store remains usable when protected storage is unavailable.
  }
}
