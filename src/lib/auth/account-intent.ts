/** Account-screen modes keep enrollment distinct from returning-user access. */
export type AccountIntent = "create" | "signin";

/** Chooses the entry mode without persisting or forcing an authentication path. */
export function initialAccountIntent(
  installedWebApp: boolean,
): AccountIntent {
  return installedWebApp ? "signin" : "create";
}

/** Describes only the account methods the current platform actually offers. */
export function accountAccessDescription(
  intent: AccountIntent,
  nativeTarget: boolean,
): string {
  if (intent === "create") {
    return "A free account syncs this device’s journey across your devices behind per-user access controls. Journal text stays out of analytics and AI.";
  }
  return nativeTarget
    ? "Use the email account connected to BibleQuest. We’ll restore its saved journey before opening the app."
    : "Use the email, Apple, or Google account connected to BibleQuest. We’ll restore its saved journey before opening the app.";
}
