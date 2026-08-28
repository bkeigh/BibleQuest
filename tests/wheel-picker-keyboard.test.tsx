// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WheelPicker } from "@/components/design-system/WheelPicker";

afterEach(cleanup);

beforeEach(() => {
  // Supplies the live reduced-motion contract that jsdom does not implement.
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }),
  });
});

const options = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
];

// Reads the browser's sequential-focus values from every native radio.
function tabStops(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).map((radio) => ({ value: radio.value, tabIndex: radio.tabIndex }));
}

describe("WheelPicker keyboard order", () => {
  it("keeps only the selected language in sequential keyboard navigation", () => {
    const view = render(
      <WheelPicker
        name="language"
        options={options}
        value="en"
        onChange={() => undefined}
      />,
    );

    expect(tabStops(view.container)).toEqual([
      { value: "en", tabIndex: 0 },
      { value: "es", tabIndex: -1 },
      { value: "pt", tabIndex: -1 },
    ]);
  });

  it("moves the one sequential stop when the controlled value changes", () => {
    const view = render(
      <WheelPicker
        name="language"
        options={options}
        value="en"
        onChange={() => undefined}
      />,
    );

    view.rerender(
      <WheelPicker
        name="language"
        options={options}
        value="pt"
        onChange={() => undefined}
      />,
    );

    expect(tabStops(view.container)).toEqual([
      { value: "en", tabIndex: -1 },
      { value: "es", tabIndex: -1 },
      { value: "pt", tabIndex: 0 },
    ]);
  });

  it("retains the native radio change contract", () => {
    let selected = "en";
    const view = render(
      <WheelPicker
        name="language"
        options={options}
        value={selected}
        onChange={(value) => {
          selected = value;
        }}
      />,
    );

    fireEvent.click(view.getByRole("radio", { name: "Español" }));
    expect(selected).toBe("es");
  });

  it("selects the centered language after a swipe-driven scroll", async () => {
    let selected = "en";
    const view = render(
      <WheelPicker
        name="language"
        options={options}
        value={selected}
        onChange={(value) => {
          selected = value;
        }}
      />,
    );
    const track = view.container.querySelector<HTMLElement>(".wheel-track");
    const row = view.container.querySelector<HTMLElement>("[data-wheel-row]");
    expect(track).not.toBeNull();
    expect(row).not.toBeNull();
    if (!track || !row) return;

    row.getBoundingClientRect = () =>
      ({ height: 48 }) as DOMRect;
    track.scrollTop = 48;
    fireEvent.pointerDown(track);
    fireEvent.scroll(track);

    await waitFor(() => expect(selected).toBe("es"));
  });
});
