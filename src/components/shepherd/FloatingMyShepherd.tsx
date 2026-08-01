"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { usePlus } from "@/lib/billing/usePlus";
import {
  MY_SHEPHERD_MAX_QUESTION_LENGTH,
  type MyShepherdAnswer,
} from "@/lib/ai/contracts";
import { apiFetch } from "@/lib/platform/api";
import { useVisualViewport } from "@/lib/platform/keyboard-inset";
import { useCompactViewport } from "@/lib/platform/media-query";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils/cn";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import {
  IconArrowRight,
  IconArrowUp,
  IconClose,
  IconSparkle,
} from "@/components/design-system/icons";
import { MyShepherdResponse } from "@/components/shepherd/MyShepherdResponse";

const STARTERS = [
  "Where can I read about hope?",
  "Help me find a gentle prayer practice.",
] as const;

/** Tallest the composer grows before it scrolls, so the reply stays in view. */
const COMPOSER_MAX_HEIGHT = 128;

/** Downward travel that reads as "put this away" rather than a stray touch. */
const DISMISS_DISTANCE = 108;
const DISMISS_FLICK_DISTANCE = 44;
const DISMISS_FLICK_VELOCITY = 0.55; // px per ms

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps the sheet clear of the home indicator when the nav is not rendered. */
const RESTING_GUTTER =
  "max(var(--app-bottom-nav-height, 4.5rem), calc(env(safe-area-inset-bottom) + 0.75rem))";

/**
 * MyShepherd's blue, one step deeper than the marian-500 it used to be.
 *
 * White on marian-500 is 4.45:1 — under the 4.5:1 floor for text this size, so
 * the header subtitle failed at any opacity, not just at the 75% it was set to.
 * marian-700 carries white at 9.4:1 and sits better against parchment. The
 * lighter blue stays where it is only a tint, never behind white text.
 */
const SHEPHERD_INK = "bg-marian-700";

interface ChatTurn {
  id: string;
  question: string;
  answer: MyShepherdAnswer;
}

/** Converts bounded API failures into calm, actionable feedback. */
function floatingErrorMessage(status: number): string {
  if (status === 401) return "Sign in again to continue.";
  if (status === 403) return "MyShepherd needs an active Plus account.";
  if (status === 429) return "MyShepherd needs a short rest. Try again later.";
  return "MyShepherd couldn’t answer just now. Please try again.";
}

/** The reader's own words, shown the moment they send rather than on reply. */
function AskedBubble({ question }: { question: string }) {
  return (
    <p
      className={cn(
        "ms-auto w-fit max-w-[88%] rounded-[16px_16px_4px_16px] px-3.5 py-2.5 text-small leading-relaxed text-white",
        SHEPHERD_INK,
      )}
    >
      {question}
    </p>
  );
}

/* The same sparkle that marks MyShepherd in the header and on the launcher, so
   a reply stays attributable once the conversation scrolls past the header. */
function ShepherdMark({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marian-500/12 text-marian-700 ring-1 ring-marian-500/25",
        pulsing && "animate-pulse",
      )}
    >
      <IconSparkle size={15} />
    </span>
  );
}

/** Provides a session-only, non-modal MyShepherd conversation above the app shell. */
export function FloatingMyShepherd() {
  const pathname = usePathname();
  const viewport = useVisualViewport();
  const compact = useCompactViewport();
  const reduceMotion = useShouldReduceMotion();
  // Asking is Plus's. The sheet still opens for everyone, because a button
  // that does nothing when pressed is worse than one that explains itself —
  // and the old order let a free reader write out a whole question before a
  // 403 came back to tell them it was never going to be answered.
  const { isPlus } = usePlus();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ y: number; at: number } | null>(null);
  const working = asking !== null;

  const close = useCallback(() => {
    setOpen(false);
    setDragOffset(0);
    setDragging(false);
    dragOrigin.current = null;
    // The launcher is hidden while the sheet is open, and a hidden element
    // cannot take focus — wait for the commit that reveals it again.
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  // On a phone the keyboard covers the sheet the instant it opens, hiding the
  // starters and the privacy note before they can be read. Desktop has room
  // for both, so only there does the field take focus on its own.
  useEffect(() => {
    if (!open) return;
    if (compact) sheetRef.current?.focus();
    else inputRef.current?.focus();
  }, [compact, open]);

  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [open, reduceMotion, turns, asking]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [close, open]);

  // The phone sheet is modal, so the page behind it must not scroll away under
  // the reader's thumb. The desktop panel deliberately leaves the page usable.
  useEffect(() => {
    if (!open || !compact) return;
    const { style } = document.body;
    const previous = style.overflow;
    style.overflow = "hidden";
    return () => {
      style.overflow = previous;
    };
  }, [compact, open]);

  // aria-modal is a promise that focus cannot wander; keep it on the phone
  // sheet, where the scrim already makes the rest of the screen unreachable.
  useEffect(() => {
    if (!open || !compact) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sheet.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [compact, open]);

  // A composer that grows with the question keeps short asks from reserving
  // four empty lines, and long ones from scrolling inside two.
  useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    // scrollHeight excludes the border, but border-box height includes it —
    // without the difference the field is left two pixels short of its own
    // text and shows a scrollbar over a single line.
    const border = node.offsetHeight - node.clientHeight;
    // With the keyboard up there may be little room left; a composer that
    // keeps growing would eat the reply it was written to ask for.
    const ceiling = viewport.height
      ? Math.min(COMPOSER_MAX_HEIGHT, Math.round(viewport.height * 0.32))
      : COMPOSER_MAX_HEIGHT;
    const wanted = node.scrollHeight + border;
    node.style.height = `${Math.max(44, Math.min(wanted, ceiling))}px`;
    // Only let it scroll once it has actually hit the ceiling. Left on `auto`,
    // macOS paints an overlay scrollbar down the edge of a field holding a
    // single line — a stray dark rule beside the send button.
    node.style.overflowY = wanted > ceiling ? "auto" : "hidden";
  }, [open, question, viewport.height]);

  async function ask(nextQuestion = question) {
    const trimmed = nextQuestion.trim();
    if (trimmed.length < 3 || working) return;
    // Show the question and empty the field straight away: waiting beside your
    // own words reads as progress, waiting beside an unchanged field reads as
    // a dropped tap.
    setAsking(trimmed);
    setQuestion("");
    setError(null);
    try {
      const response = await apiFetch("/api/ai/shepherd", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, currentPath: pathname }),
      });
      if (!response.ok) {
        setError(floatingErrorMessage(response.status));
        setQuestion(trimmed);
        return;
      }
      const answer = (await response.json()) as MyShepherdAnswer;
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), question: trimmed, answer },
      ]);
    } catch {
      setError(floatingErrorMessage(503));
      // Nothing was answered, so the words belong back in the reader's hands.
      setQuestion(trimmed);
    } finally {
      setAsking(null);
    }
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    void ask();
  }

  // Swipe the header down to dismiss, the gesture a bottom sheet implies.
  // Tracked by hand rather than by a drag library so the conversation below
  // keeps its own vertical scrolling.
  function startDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!compact) return;
    dragOrigin.current = { y: event.clientY, at: event.timeStamp };
    setDragging(true);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const origin = dragOrigin.current;
    if (!origin) return;
    const travelled = event.clientY - origin.y;
    if (travelled > 4) event.currentTarget.setPointerCapture(event.pointerId);
    setDragOffset(Math.max(0, travelled));
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    setDragging(false);
    setDragOffset(0);
    if (!origin) return;
    const travelled = Math.max(0, event.clientY - origin.y);
    const velocity = travelled / Math.max(1, event.timeStamp - origin.at);
    if (
      travelled > DISMISS_DISTANCE ||
      (travelled > DISMISS_FLICK_DISTANCE && velocity > DISMISS_FLICK_VELOCITY)
    ) {
      close();
    }
  }

  const horizontalOffset = "max(1rem, calc((100vw - 48rem) / 2))";
  const remaining = MY_SHEPHERD_MAX_QUESTION_LENGTH - question.length;
  const canSend = !working && question.trim().length >= 3;
  const sheetTransition =
    reduceMotion || dragging
      ? { duration: 0 }
      : ({ type: "spring", stiffness: 420, damping: 38 } as const);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="my-shepherd-frame"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.16 }}
            className={cn(
              // Sized to the region the reader can actually see, so the sheet
              // is laid out above the keyboard instead of guessing past it.
              "fixed inset-x-0 z-[45] flex flex-col justify-end",
              // The phone sheet is inset from the screen edges; the desktop
              // panel keeps its own margin, so the padding is compact-only.
              "px-4 sm:px-0",
              !compact && "pointer-events-none",
            )}
            style={{
              top: viewport.offsetTop,
              height: viewport.height || "100dvh",
              paddingTop: "max(env(safe-area-inset-top), 0.75rem)",
              // A card with rounded corners needs to clear what it sits above,
              // or its bottom edge reads as a seam against the tab bar.
              paddingBottom: viewport.keyboardInset
                ? "0.5rem"
                : `calc(${RESTING_GUTTER} + 0.625rem)`,
            }}
          >
            {/* A scrim only on phones, where the sheet owns the screen. It sits
                above the bottom nav so the two do not read as competing bars. */}
            {compact && (
              <button
                type="button"
                aria-label="Close MyShepherd"
                tabIndex={-1}
                onClick={close}
                className="absolute inset-0 cursor-default bg-graphite/25 backdrop-blur-[2px]"
              />
            )}

            <motion.section
              ref={sheetRef}
              id="floating-my-shepherd"
              role="dialog"
              aria-modal={compact}
              aria-label="Ask MyShepherd"
              tabIndex={-1}
              initial={compact ? { y: "100%" } : { opacity: 0, y: 12 }}
              animate={compact ? { y: dragOffset } : { opacity: 1, y: 0 }}
              exit={compact ? { y: "100%" } : { opacity: 0, y: 12 }}
              transition={sheetTransition}
              className={[
                "app-glass-surface pointer-events-auto relative flex min-h-0 max-h-full flex-col overflow-hidden",
                "border border-mist bg-paper/95 paper-shadow-lg backdrop-blur-xl",
                // A card, rounded on every corner. It used to run edge to edge
                // with a square bottom — the sides of a docked sheet on
                // something that stops above the tab bar, which is what made it
                // read as crowded against the screen rather than deliberate.
                "rounded-[22px]",
                // Desktop: the same card, anchored bottom-end.
                "sm:self-end sm:me-[var(--shepherd-inset)] sm:max-h-[42rem]",
                "sm:w-[min(25rem,calc(100vw-2rem))]",
              ].join(" ")}
              style={{ ["--shepherd-inset" as string]: horizontalOffset }}
            >
              <header
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ touchAction: compact ? "none" : undefined }}
                className={cn(
                  "relative flex shrink-0 items-center gap-3 px-4 pt-4 pb-3 text-white sm:pt-3",
                  SHEPHERD_INK,
                )}
              >
                {compact && (
                  // The handle for the swipe-down dismiss. At 45% white it was
                  // a smudge nobody would read as an affordance.
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-2 mx-auto h-1.5 w-10 rounded-full bg-white/70"
                  />
                )}
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                  <IconSparkle size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[1.125rem] leading-tight">
                    MyShepherd
                  </span>
                  <span className="block text-caption text-white/75">
                    Scripture and BibleQuest guide
                  </span>
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close MyShepherd"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <IconClose size={19} />
                </button>
              </header>

              <div
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
              >
                {!isPlus && (
                  <div>
                    <p className="text-small leading-relaxed text-charcoal">
                      MyShepherd answers Bible questions, finds a passage from a
                      half-remembered line, and points you to the right corner
                      of BibleQuest. It comes with Plus.
                    </p>
                    <div className="mt-3 grid gap-2">
                      {STARTERS.map((starter) => (
                        <p
                          key={starter}
                          className="flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-button)] border border-mist bg-linen/50 px-3.5 py-2.5 text-start text-small text-ash"
                        >
                          <IconArrowRight
                            size={15}
                            aria-hidden="true"
                            className="shrink-0 text-gilt"
                          />
                          <span className="min-w-0 flex-1">{starter}</span>
                        </p>
                      ))}
                    </div>
                    <Link
                      href="/app/plus"
                      onClick={close}
                      className="mt-4 flex min-h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-gold-500 px-4 text-[0.9375rem] font-medium text-graphite transition-colors hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Explore Plus
                    </Link>
                    <p className="mt-3 text-caption leading-relaxed text-ash">
                      Reading, prayers, quests, and the arcade never need Plus.
                      You can also turn this button off in Settings.
                    </p>
                  </div>
                )}

                {isPlus && turns.length === 0 && !working && (
                  <div>
                    <p className="text-small leading-relaxed text-charcoal">
                      Ask a Bible question, find a passage, or ask where to go in
                      BibleQuest.
                    </p>
                    {/* Rows with a leading arrow, not pills. As rounded-full
                        chips these were the same shape and colour as the reply
                        bubbles that appear seconds later, so the one thing on
                        the empty screen worth tapping read as a message. */}
                    <div className="mt-3 grid gap-2">
                      {STARTERS.map((starter) => (
                        <button
                          key={starter}
                          type="button"
                          onClick={() => void ask(starter)}
                          className="flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-button)] border border-mist bg-linen/70 px-3.5 py-2.5 text-start text-small text-charcoal transition-colors duration-300 hover:border-accent/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <IconArrowRight
                            size={15}
                            className="shrink-0 text-accent"
                          />
                          <span className="min-w-0 flex-1">{starter}</span>
                        </button>
                      ))}
                    </div>
                    {/* Housekeeping, kept true but kept quiet — it was the
                        largest block on the screen, outweighing the invitation. */}
                    <p className="mt-3 text-caption leading-relaxed text-ash">
                      Your questions are not saved.
                    </p>
                  </div>
                )}

                {turns.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    <AskedBubble question={turn.question} />
                    <div className="flex gap-2.5">
                      <ShepherdMark />
                      <div className="min-w-0 flex-1 rounded-[16px_16px_16px_4px] border border-mist bg-paper px-4 py-4">
                        <MyShepherdResponse
                          answer={turn.answer}
                          compact
                          onNavigate={close}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {asking && (
                  <div className="space-y-3">
                    <AskedBubble question={asking} />
                    <div className="flex items-center gap-2.5">
                      <ShepherdMark pulsing />
                      <p role="status" className="text-small text-ash">
                        Thinking gently…
                      </p>
                    </div>
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-small text-rose-700">
                    {error}
                  </p>
                )}
              </div>

              {/* No composer without Plus. A disabled textarea would still
                  invite a reader to try typing into it. */}
              {isPlus && (
              <form
                className="shrink-0 border-t border-mist/70 px-3 py-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask();
                }}
              >
                <label htmlFor="floating-shepherd-question" className="sr-only">
                  Ask MyShepherd
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    id="floating-shepherd-question"
                    rows={1}
                    maxLength={MY_SHEPHERD_MAX_QUESTION_LENGTH}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={submitOnEnter}
                    placeholder="Ask about Scripture…"
                    className="min-h-11 flex-1 resize-none overflow-y-auto rounded-[14px] border border-mist bg-linen px-3 py-2.5 text-small leading-relaxed text-graphite outline-none placeholder:text-quill focus:border-accent/50"
                  />
                  {/* Waiting, not broken: a filled blue circle faded to 45%
                      read as a control that had failed. Empty until there is
                      something to send, filled the moment there is. */}
                  <button
                    type="submit"
                    disabled={!canSend}
                    aria-label="Send question"
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      canSend
                        ? `${SHEPHERD_INK} text-white`
                        : "border border-mist bg-linen text-quill",
                    )}
                  >
                    <IconArrowUp size={19} />
                  </button>
                </div>
                {remaining <= 80 && (
                  <p className="mt-1.5 text-end text-caption text-ash">
                    {remaining} characters left
                  </p>
                )}
              </form>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={launcherRef}
        type="button"
        hidden={open}
        onClick={() => setOpen(true)}
        aria-label="Ask MyShepherd"
        aria-expanded={open}
        aria-controls="floating-my-shepherd"
        className={cn(
          "fixed z-50 grid place-items-center rounded-full",
          "transition-transform hover:-translate-y-0.5 active:translate-y-0",
          // No plate behind it. The sprite is drawn with its own transparency
          // and reads as a character standing on the page; a blue disc around
          // it turned that character into a small mark inside a button.
          //
          // The focus ring is a box-shadow, never `outline` — an outline with
          // an offset is drawn as a rectangle by some engines regardless of
          // border-radius, which is what squared this off whenever it took
          // focus, most visibly right after the sheet closed and handed focus
          // back to it.
          "outline-none focus-visible:shadow-[0_0_0_3px_var(--color-paper),0_0_0_5px_var(--color-accent)]",
        )}
        style={{
          insetInlineEnd: horizontalOffset,
          bottom: `calc(${RESTING_GUTTER} + 1rem)`,
        }}
      >
        {/* A soft drop shadow does the separating a plate used to, so the
            shepherd stays legible over parchment, a wallpaper, or a card. */}
        <PixelIcon
          name="myshepherd"
          size={108}
          className="[filter:drop-shadow(0_3px_6px_rgb(32_70_94/0.34))]"
        />
      </button>
    </>
  );
}
