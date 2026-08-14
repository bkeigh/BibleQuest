import { withDeadline } from "@/lib/async/deadline";

export const SYNC_REQUEST_DEADLINE_MS = 15_000;

/** Bound one remote operation without timing local merge or persistence work. */
export function withSyncRequestDeadline<T>(
  request: PromiseLike<T>,
  operation = "Account sync request",
): Promise<T> {
  return withDeadline(request, SYNC_REQUEST_DEADLINE_MS, operation);
}
