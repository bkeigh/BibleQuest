"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { usePathname } from "next/navigation";
import {
  MY_SHEPHERD_MAX_QUESTION_LENGTH,
  type MyShepherdAnswer,
} from "@/lib/ai/contracts";
import { apiFetch } from "@/lib/platform/api";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import {
  IconClose,
  IconSparkle,
} from "@/components/design-system/icons";
import { MyShepherdResponse } from "@/components/shepherd/MyShepherdResponse";

const STARTERS = [
  "Where can I read about hope?",
  "Help me find a gentle prayer practice.",
] as const;

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

/** Provides a session-only, non-modal MyShepherd conversation above the app shell. */
export function FloatingMyShepherd() {
  const pathname = usePathname();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [open, turns, working]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function ask(nextQuestion = question) {
    const trimmed = nextQuestion.trim();
    if (trimmed.length < 3 || working) return;
    setWorking(true);
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
        return;
      }
      const answer = (await response.json()) as MyShepherdAnswer;
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), question: trimmed, answer },
      ]);
      setQuestion("");
    } catch {
      setError(floatingErrorMessage(503));
    } finally {
      setWorking(false);
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

  const horizontalOffset =
    "max(1rem, calc((100vw - 48rem) / 2))";

  return (
    <>
      {open && (
        <section
          id="floating-my-shepherd"
          role="dialog"
          aria-label="Ask MyShepherd"
          className="app-glass-surface fixed z-50 flex w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-mist bg-paper/95 paper-shadow-lg backdrop-blur-xl"
          style={{
            right: horizontalOffset,
            bottom:
              "calc(var(--app-bottom-nav-height, 4.5rem) + 5.25rem)",
            maxHeight: "min(68dvh, 42rem)",
          }}
        >
          <header className="flex items-center gap-3 border-b border-mist/70 bg-[#3F7EA3] px-4 py-3 text-white">
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
              onClick={() => setOpen(false)}
              aria-label="Close MyShepherd"
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/85 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <IconClose size={19} />
            </button>
          </header>

          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            {turns.length === 0 && (
              <div>
                <p className="text-small leading-relaxed text-charcoal">
                  Ask a Bible question, find a passage, or ask where to go in
                  BibleQuest. Your questions are not saved.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void ask(starter)}
                      className="min-h-10 rounded-full border border-mist bg-linen px-3 py-2 text-left text-caption text-charcoal hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn) => (
              <div key={turn.id} className="space-y-3">
                <p className="ml-auto w-fit max-w-[88%] rounded-[16px_16px_4px_16px] bg-[#3F7EA3] px-3.5 py-2.5 text-small leading-relaxed text-white">
                  {turn.question}
                </p>
                <div className="rounded-[16px_16px_16px_4px] border border-mist bg-paper px-4 py-4">
                  <MyShepherdResponse
                    answer={turn.answer}
                    compact
                    onNavigate={() => setOpen(false)}
                  />
                </div>
              </div>
            ))}

            {working && (
              <p role="status" className="text-small text-ash">
                Thinking gently…
              </p>
            )}
            {error && (
              <p role="alert" className="text-small text-rose-700">
                {error}
              </p>
            )}
          </div>

          <form
            className="border-t border-mist/70 bg-paper px-3 py-3"
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
                rows={2}
                maxLength={MY_SHEPHERD_MAX_QUESTION_LENGTH}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={submitOnEnter}
                placeholder="Ask about Scripture…"
                className="min-h-11 flex-1 resize-none rounded-[14px] border border-mist bg-linen px-3 py-2.5 text-small leading-relaxed text-graphite outline-none focus:border-accent/50"
              />
              <button
                type="submit"
                disabled={working || question.trim().length < 3}
                aria-label="Send question"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#3F7EA3] text-white transition-opacity disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconSparkle size={18} />
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close MyShepherd" : "Ask MyShepherd"}
        aria-expanded={open}
        aria-controls="floating-my-shepherd"
        className="fixed z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-[#3F7EA3] text-white shadow-[0_10px_28px_rgba(32,70,94,0.32)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
        style={{
          right: horizontalOffset,
          bottom:
            "calc(var(--app-bottom-nav-height, 4.5rem) + 1rem)",
        }}
      >
        {open ? <IconClose size={20} /> : <PixelIcon name="star" size={4} />}
      </button>
    </>
  );
}
