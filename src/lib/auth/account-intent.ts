/** Account-screen modes keep enrollment distinct from returning-user access. */
export type AccountIntent = "create" | "signin";

/** Chooses the entry mode without persisting or forcing an authentication path. */
export function initialAccountIntent(
  installedWebApp: boolean,
): AccountIntent {
  return installedWebApp ? "signin" : "create";
}
