export type GameAccessSurface = "today" | "archive" | "theme-pack";

export interface GameAccessDecision {
  allowed: boolean;
  reason: "free-today" | "plus-member" | "plus-optional";
  message: string;
}

/**
 * Keeps today's complete learning experience free while reserving optional
 * breadth—not better answers, hints, or formation credit—for Plus.
 */
export function getGameAccess(
  surface: GameAccessSurface,
  isPlus: boolean,
): GameAccessDecision {
  if (surface === "today") {
    return {
      allowed: true,
      reason: "free-today",
      message: "Today’s complete game and learning card are included.",
    };
  }
  if (isPlus) {
    return {
      allowed: true,
      reason: "plus-member",
      message:
        surface === "archive"
          ? "The optional game archive is included with Plus."
          : "Optional themed game collections are included with Plus.",
    };
  }
  return {
    allowed: false,
    reason: "plus-optional",
    message:
      surface === "archive"
        ? "Today’s game remains available. Plus includes an optional archive for revisiting earlier studies."
        : "Today’s game remains available. Plus includes optional themed collections.",
  };
}
