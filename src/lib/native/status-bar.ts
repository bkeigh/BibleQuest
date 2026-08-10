/** Keeps iOS status-bar foreground contrast aligned with the resolved theme. */
import { isNativeTarget } from "@/lib/platform/target";

type StatusBarStyle = "DARK" | "LIGHT";

interface StatusBarAdapter {
  setStyle: (options: { style: StatusBarStyle }) => Promise<void>;
}

/** Capacitor names DARK for light content on a dark background. */
export function statusBarStyleForTheme(darkBackground: boolean): StatusBarStyle {
  return darkBackground ? "DARK" : "LIGHT";
}

export async function syncNativeStatusBar(
  darkBackground: boolean,
  adapter?: StatusBarAdapter,
): Promise<void> {
  if (!isNativeTarget()) return;
  const style = statusBarStyleForTheme(darkBackground);
  if (adapter) {
    await adapter.setStyle({ style });
    return;
  }
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  await StatusBar.setStyle({
    style: style === "DARK" ? Style.Dark : Style.Light,
  });
}
