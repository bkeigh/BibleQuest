// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "@/components/app-shell/InstallPrompt";
import { InstallPromptEventCapture } from "@/components/app-shell/InstallPromptEventCapture";
import { clearDeferredInstallPrompt } from "@/lib/pwa/install-event";

class InstallEvent extends Event {
  prompt = vi.fn(async () => undefined);
  userChoice = Promise.resolve({ outcome: "accepted" });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      media: "(display-mode: standalone)",
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  clearDeferredInstallPrompt();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InstallPrompt post-value eligibility", () => {
  it("captures an early browser event without displaying before value", async () => {
    const view = render(
      <>
        <InstallPromptEventCapture />
        <InstallPrompt eligible={false} />
      </>,
    );
    const installEvent = new InstallEvent("beforeinstallprompt", {
      cancelable: true,
    });

    fireEvent(window, installEvent);
    expect(installEvent.defaultPrevented).toBe(true);
    expect(view.queryByText("Use BibleQuest like an app")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(12000);
    });
    expect(view.queryByText("Use BibleQuest like an app")).toBeNull();

    view.rerender(<InstallPrompt eligible />);
    await act(async () => {
      vi.advanceTimersByTime(11999);
    });
    expect(view.queryByText("Use BibleQuest like an app")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(view.getByText("Use BibleQuest like an app")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Add to home screen" }));
    await act(async () => undefined);
    expect(installEvent.prompt).toHaveBeenCalledOnce();
  });
});
