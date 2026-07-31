export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export type ShareOutcome =
  | "shared"
  | "copied"
  | "cancelled"
  | "unavailable";

interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: {
    writeText: (value: string) => Promise<void>;
  };
}

interface ShareDocument {
  body: Pick<HTMLElement, "appendChild">;
  createElement: Document["createElement"];
  execCommand?: (command: string) => boolean;
}

interface ShareDependencies {
  navigator?: ShareNavigator;
  document?: ShareDocument;
}

/** Detects system sharing without prompting or inspecting the share payload. */
export function systemShareSupported(
  dependencies: ShareDependencies = {},
): boolean {
  const navigatorValue =
    dependencies.navigator ??
    (typeof navigator !== "undefined" ? navigator : undefined);
  return typeof navigatorValue?.share === "function";
}

/** Copies without telemetry or error logging; callers decide only the public outcome copy. */
export async function copyTextToClipboard(
  value: string,
  dependencies: ShareDependencies = {},
): Promise<boolean> {
  const navigatorValue =
    dependencies.navigator ??
    (typeof navigator !== "undefined" ? navigator : undefined);
  try {
    if (navigatorValue?.clipboard?.writeText) {
      await navigatorValue.clipboard.writeText(value);
      return true;
    }
  } catch {
    // A restricted webview may still support the selection fallback.
  }

  const documentValue =
    dependencies.document ??
    (typeof document !== "undefined" ? document : undefined);
  if (!documentValue) return false;
  let field: HTMLTextAreaElement | null = null;
  try {
    field = documentValue.createElement("textarea");
    field.value = value;
    field.readOnly = true;
    field.style.position = "fixed";
    field.style.opacity = "0";
    documentValue.body.appendChild(field);
    field.select();
    return documentValue.execCommand?.("copy") ?? false;
  } catch {
    return false;
  } finally {
    try {
      field?.remove();
    } catch {
      // A detached or restricted fallback field needs no further cleanup.
    }
  }
}

/** Uses system share first, then a clipboard fallback, and never logs payload content. */
export async function shareContent(
  payload: SharePayload,
  dependencies: ShareDependencies = {},
): Promise<ShareOutcome> {
  const navigatorValue =
    dependencies.navigator ??
    (typeof navigator !== "undefined" ? navigator : undefined);
  if (navigatorValue?.share) {
    try {
      await navigatorValue.share(payload);
      return "shared";
    } catch (error) {
      if (isShareCancellation(error)) return "cancelled";
    }
  }

  const fallback = [payload.text, payload.url].filter(Boolean).join("\n\n");
  if (!fallback) return "unavailable";
  return (await copyTextToClipboard(fallback, dependencies))
    ? "copied"
    : "unavailable";
}

/** Recognizes browser cancellation without reflecting arbitrary error details. */
function isShareCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
