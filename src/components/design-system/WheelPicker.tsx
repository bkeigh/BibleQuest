"use client";

/**
 * An iOS-style drum picker that is really a radio group.
 *
 * The onboarding language step listed nineteen options in a tall scrolling
 * box. A drum shows the same options in five compact rows, like Apple's date
 * and age pickers, while short phones fall back to three rows.
 *
 * The important decision is what this ISN'T: no custom widget, no ARIA
 * listbox, no synthetic focus management. It is `<input type="radio">` per
 * row with CSS scroll-snap over the top, so keyboard, VoiceOver, and every
 * theme behave correctly without being re-implemented. The caller supplies
 * the `<fieldset><legend>` that names the group.
 */
import { useCallback, useEffect, useRef } from "react";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";

export interface WheelOption {
  value: string;
  /** A flag or glyph. Decorative — never the only carrier of meaning. */
  mark?: string;
  label: string;
  lang?: string;
  dir?: "ltr" | "rtl";
  /** Announced but not shown, when the label alone would not identify it. */
  gloss?: string;
}

export function WheelPicker({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: WheelOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  /** True only while a real finger or wheel is driving the scroll. */
  const userDriven = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const frame = useRef(0);
  const firstRun = useRef(true);
  const reduceMotion = useShouldReduceMotion();

  // Mirrored so the scroll listener can subscribe once and never re-bind.
  // Written in an effect, not during render: a ref mutation during render is
  // unsafe under concurrent rendering, and the listener only ever reads this
  // after a commit anyway.
  const latest = useRef({ options, value, onChange });
  useEffect(() => {
    latest.current = { options, value, onChange };
  });

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  /** Measured, never hardcoded: html.text-large scales --wheel-row. */
  const rowHeight = useCallback(
    () =>
      trackRef.current
        ?.querySelector<HTMLElement>("[data-wheel-row]")
        ?.getBoundingClientRect().height ?? 0,
    [],
  );

  // Centre the selected row when selection changes from outside a live flick.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || userDriven.current) return;
    const height = rowHeight();
    if (!height) return;
    const top = selectedIndex * height;
    if (Math.abs(track.scrollTop - top) < 1) return;
    // The explicit "auto" matters: the global prefers-reduced-motion rule
    // sets scroll-behavior in CSS, which does NOT govern a JS behavior arg.
    track.scrollTo({
      top,
      behavior: firstRun.current || reduceMotion ? "auto" : "smooth",
    });
    firstRun.current = false;
  }, [selectedIndex, reduceMotion, rowHeight]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const markUser = () => {
      userDriven.current = true;
    };

    /** Gives each visible row the shallow cylindrical depth of an iOS wheel. */
    function updatePresentation(el: HTMLDivElement, height: number) {
      const centerIndex = el.scrollTop / height;
      el.querySelectorAll<HTMLElement>("[data-wheel-row]").forEach(
        (row, index) => {
          const distance = Math.max(-2.5, Math.min(2.5, index - centerIndex));
          const depth = Math.abs(distance);
          row.style.setProperty(
            "--wheel-tilt",
            reduceMotion ? "0deg" : `${distance * -12}deg`,
          );
          row.style.setProperty(
            "--wheel-scale",
            reduceMotion ? "1" : String(1 - depth * 0.035),
          );
          row.style.setProperty(
            "--wheel-opacity",
            String(Math.max(0.32, 1 - depth * 0.27)),
          );
        },
      );
    }

    function read() {
      const el = trackRef.current;
      if (!el) return;
      const height = rowHeight();
      if (!height) return;
      updatePresentation(el, height);
      const { options: opts, value: current, onChange: commit } = latest.current;
      const index = Math.min(
        opts.length - 1,
        Math.max(0, Math.round(el.scrollTop / height)),
      );
      const next = opts[index];
      // The gate is load-bearing for accessibility: VoiceOver scrolls this
      // container to reveal an off-screen radio, and without it merely
      // browsing with a screen reader would change the answer.
      if (userDriven.current && next && next.value !== current) commit(next.value);
    }

    function settle() {
      userDriven.current = false;
      read();
    }

    function onScroll() {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(read);
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(settle, 140);
    }

    track.addEventListener("pointerdown", markUser, { passive: true });
    track.addEventListener("wheel", markUser, { passive: true });
    track.addEventListener("scroll", onScroll, { passive: true });
    // Lands the settle immediately where supported; iOS 15–18.1 uses the
    // timer above. Running settle twice is harmless — it is idempotent.
    const hasScrollEnd = "onscrollend" in window;
    if (hasScrollEnd) track.addEventListener("scrollend", settle);
    frame.current = requestAnimationFrame(read);

    return () => {
      cancelAnimationFrame(frame.current);
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      track.removeEventListener("pointerdown", markUser);
      track.removeEventListener("wheel", markUser);
      track.removeEventListener("scroll", onScroll);
      if (hasScrollEnd) track.removeEventListener("scrollend", settle);
    };
  }, [reduceMotion, rowHeight]);

  /** Home/End only — native radio groups do not provide them. Arrows are
      the browser's job, and the centring effect follows whatever it picks. */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = event.key === "Home" ? 0 : options.length - 1;
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    trackRef.current
      ?.querySelectorAll<HTMLInputElement>("input")
      [index]?.focus();
  }

  return (
    <div className="wheel">
      <div aria-hidden="true" className="wheel-band" />
      <div ref={trackRef} className="wheel-track" onKeyDown={onKeyDown}>
        <div aria-hidden="true" className="wheel-pad" />
        {options.map((option, index) => (
          <label key={option.value} data-wheel-row className="wheel-row">
            {/* Keep the selected radio as the group's one sequential stop;
                native arrow behavior still moves within the group. */}
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              tabIndex={index === selectedIndex ? 0 : -1}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="wheel-face">
              <span
                aria-hidden="true"
                className="wheel-mark text-[1.125rem] leading-none"
              >
                {option.mark ?? ""}
              </span>
              <span
                lang={option.lang}
                dir={option.dir}
                className="wheel-label truncate text-center text-[1.0625rem]"
              >
                {option.label}
              </span>
              <span aria-hidden="true" className="wheel-mark" />
              {option.gloss && <span className="sr-only">{option.gloss}</span>}
            </span>
          </label>
        ))}
        <div aria-hidden="true" className="wheel-pad" />
      </div>
      <div aria-hidden="true" className="wheel-fade wheel-fade-top" />
      <div aria-hidden="true" className="wheel-fade wheel-fade-bottom" />
    </div>
  );
}
