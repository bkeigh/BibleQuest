"use client";

import Script from "next/script";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { GentleButton } from "@/components/design-system/GentleButton";
import { PaperCard } from "@/components/design-system/PaperCard";
import { PixelIcon } from "@/components/design-system/PixelIcon";
import {
  PREVIEW_GATE_SESSION_KEY,
  PREVIEW_GATE_SESSION_VALUE,
  TALLY_WAITLIST_EMBED_URL,
  TALLY_WAITLIST_SCRIPT_URL,
  TALLY_WAITLIST_URL,
  isPreviewPasswordAccepted,
} from "@/lib/preview-gate";
import { useHydrated } from "@/lib/utils/useHydrated";

interface WaitlistGateProps {
  children: ReactNode;
}

function hasPreviewAccess(): boolean {
  try {
    return (
      window.sessionStorage.getItem(PREVIEW_GATE_SESSION_KEY) ===
      PREVIEW_GATE_SESSION_VALUE
    );
  } catch {
    return false;
  }
}

function loadTallyEmbeds() {
  const tallyWindow = window as Window & {
    Tally?: { loadEmbeds: () => void };
  };
  tallyWindow.Tally?.loadEmbeds();
}

export function WaitlistGate({ children }: WaitlistGateProps) {
  const hydrated = useHydrated();
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    document.getElementById("homepage-heading")?.focus();
  }, [unlocked]);

  // Keep the homepage hidden on the server and first client paint. Once
  // hydrated, a session grant can restore it without hydration drift.
  if (unlocked || (hydrated && hasPreviewAccess())) {
    return <>{children}</>;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isPreviewPasswordAccepted(password)) {
      setError("That preview password does not match. Please try again.");
      return;
    }

    try {
      window.sessionStorage.setItem(
        PREVIEW_GATE_SESSION_KEY,
        PREVIEW_GATE_SESSION_VALUE,
      );
    } catch {
      // Private browsing or strict storage settings may reject sessionStorage.
      // The in-memory grant still unlocks the current page.
    }

    setError(null);
    setUnlocked(true);
  }

  return (
    <main
      id="main-content"
      aria-labelledby="waitlist-heading"
      className="relative isolate min-h-dvh overflow-hidden bg-parchment px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-gold-50),transparent)]"
      />

      <div className="mx-auto max-w-3xl">
        <header className="mx-auto mb-8 max-w-2xl text-center">
          <PixelIcon name="lantern" size={7} animate className="mx-auto mb-5" />
          <p className="font-pixel text-caption uppercase tracking-[0.16em] text-accent">
            BibleQuest is almost ready
          </p>
          <h1
            id="waitlist-heading"
            className="mt-3 font-display text-editorial text-graphite sm:text-heading"
          >
            Faith, one small step at a time.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ash">
            Join the waitlist for launch news and early access. We will only
            send the updates that matter.
          </p>
        </header>

        <PaperCard
          as="section"
          variant="atmospheric"
          padding="none"
          className="overflow-hidden"
          aria-label="BibleQuest waitlist"
        >
          <iframe
            data-tally-src={TALLY_WAITLIST_EMBED_URL}
            title="Join the BibleQuest waitlist"
            loading="eager"
            width="100%"
            height="640"
            className="block w-full border-0 bg-transparent"
          />
          <Script
            src={TALLY_WAITLIST_SCRIPT_URL}
            strategy="afterInteractive"
            onLoad={loadTallyEmbeds}
            onReady={loadTallyEmbeds}
          />
          <p className="border-t border-mist bg-linen/70 px-4 py-3 text-center text-caption text-ash">
            Having trouble with the form?{" "}
            <a
              href={TALLY_WAITLIST_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent underline-offset-4 hover:underline"
            >
              Open the waitlist in a new tab
            </a>
            .
          </p>
        </PaperCard>

        <PaperCard
          as="section"
          variant="paper"
          padding="md"
          className="mx-auto mt-5 max-w-2xl"
          aria-labelledby="preview-access-heading"
        >
          <div className="mb-4">
            <h2
              id="preview-access-heading"
              className="font-display text-[1.25rem] text-graphite"
            >
              Already invited to preview BibleQuest?
            </h2>
            <p id="preview-password-help" className="mt-1 text-small text-ash">
              Enter the temporary preview password to open the homepage.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-small font-medium text-charcoal">
                Preview password
                <input
                  type="password"
                  name="preview-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError(null);
                  }}
                  autoComplete="off"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    error
                      ? "preview-password-help preview-password-error"
                      : "preview-password-help"
                  }
                  className="min-h-12 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-body text-graphite outline-none transition-colors duration-200 placeholder:text-fog focus:border-accent focus:ring-2 focus:ring-accent/15"
                  placeholder="Enter preview password"
                />
              </label>
              <GentleButton type="submit" variant="primary" className="min-h-12">
                Open homepage
              </GentleButton>
            </div>

            {error ? (
              <p
                id="preview-password-error"
                role="alert"
                className="mt-3 text-small text-rose-700"
              >
                {error}
              </p>
            ) : null}
          </form>
        </PaperCard>
      </div>
    </main>
  );
}
