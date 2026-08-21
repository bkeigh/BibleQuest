/** Bounds one complete user-started sign-in request. */
export const AUTH_REQUEST_DEADLINE_MS = 12_000;

/** Stops an interactive sign-in from waiting forever behind another tab. */
export const WEB_AUTH_INTERACTIVE_LOCK_TIMEOUT_MS = 2_000;

/** Bounds registration and controller replacement for the browser auth worker. */
export const WEB_AUTH_SERVICE_WORKER_CONTROLLER_TIMEOUT_MS = 3_500;

/** Outlasts the worker's 2s parallel tab challenge and bounds its final reply. */
export const WEB_AUTH_SERVICE_WORKER_RESULT_TIMEOUT_MS = 2_500;
