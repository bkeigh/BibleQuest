"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton, GentleLink } from "@/components/design-system/GentleButton";
import { applyAppearance } from "@/lib/theme";
import { parseSnapshot } from "@/lib/questos/import-schema";
import type { QuestOSSnapshot } from "@/lib/questos/types";
import { cn } from "@/lib/utils/cn";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <span className="text-[0.9375rem] text-charcoal">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full border border-mist bg-linen p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-[0.8125rem] transition-all duration-300",
            value === o.value
              ? "bg-paper text-graphite paper-shadow"
              : "text-ash hover:text-charcoal"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors duration-300",
        on ? "bg-olive-500" : "bg-mist"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-paper transition-all duration-300",
          on ? "left-[1.375rem]" : "left-0.5"
        )}
      />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-6 px-1 text-[0.75rem] uppercase tracking-[0.16em] text-olive-500">
      {children}
    </p>
  );
}

function SettingsInner() {
  const router = useRouter();
  const { toast } = useToast();
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);
  const updateSettings = useQuestOS((s) => s.updateSettings);
  const clearAllData = useQuestOS((s) => s.clearAllData);
  const importData = useQuestOS((s) => s.importData);
  const store = useQuestOS;

  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] =
    useState<Partial<QuestOSSnapshot> | null>(null);

  const appearance = settings.appearance;

  function setAppearance(patch: Partial<typeof appearance>) {
    const next = { ...appearance, ...patch };
    updateSettings({ appearance: next });
    applyAppearance(next);
  }

  function exportData() {
    const data = store.getState();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "biblequest-journey.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Your journey was exported.");
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file still fires onChange
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("That file couldn’t be read.");
      return;
    }
    const result = parseSnapshot(text);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    setPendingImport(result.data); // arm the confirm step
  }

  function confirmImport() {
    if (!pendingImport) return;
    importData(pendingImport);
    setPendingImport(null);
    applyAppearance(store.getState().settings.appearance);
    toast("Your journey was restored.");
  }

  return (
    <>
      <PageHeader title="Settings" subtitle={profile ? `Signed in as ${profile.displayName}` : undefined} />
      <PageContainer className="pb-8">
        <SectionTitle>Account</SectionTitle>
        <PaperCard variant="paper" padding="none" className="overflow-hidden">
          <Link
            href="/app/account"
            className="flex items-center justify-between px-4 py-3.5 text-charcoal hover:bg-linen"
          >
            <span className="text-[0.9375rem]">Sync across devices</span>
            <span className="text-[0.8125rem] text-ash">Optional</span>
          </Link>
        </PaperCard>

        <SectionTitle>Appearance</SectionTitle>
        <PaperCard variant="paper" padding="md">
          <div className="divide-y divide-mist/70">
            <Row label="Theme">
              <Segmented
                value={appearance.theme}
                onChange={(theme) => setAppearance({ theme })}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Candle" },
                  { value: "system", label: "System" },
                ]}
              />
            </Row>
            <Row label="Text size">
              <Segmented
                value={appearance.textSize}
                onChange={(textSize) => setAppearance({ textSize })}
                options={[
                  { value: "default", label: "Default" },
                  { value: "large", label: "Large" },
                ]}
              />
            </Row>
            <Row label="Reduce motion">
              <Toggle
                on={appearance.reducedMotion}
                onChange={(reducedMotion) => setAppearance({ reducedMotion })}
              />
            </Row>
          </div>
        </PaperCard>

        <SectionTitle>Notifications</SectionTitle>
        <PaperCard variant="paper" padding="md">
          <p className="text-[0.875rem] leading-relaxed text-ash">
            Gentle reminders are coming soon. When they arrive, they’ll be
            invitations — never pressure, never streak warnings. You’ll choose
            exactly what and when.
          </p>
        </PaperCard>

        <SectionTitle>Privacy &amp; data</SectionTitle>
        <PaperCard variant="paper" padding="md">
          <p className="text-[0.9375rem] leading-relaxed text-charcoal">
            Your prayers and reflections are private by default. On this device
            they’re stored only for you. We never sell your data, and analytics
            never include prayer or journal text.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <GentleButton variant="outline" size="sm" onClick={exportData}>
              Export my journey
            </GentleButton>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={onFilePicked}
            />
            <GentleButton
              variant="outline"
              size="sm"
              onClick={() => {
                setImportError(null);
                fileInputRef.current?.click();
              }}
            >
              Restore a journey
            </GentleButton>
            <Link
              href="/privacy"
              className="inline-flex items-center px-1 text-[0.875rem] text-olive-700 hover:text-olive-500"
            >
              Privacy policy
            </Link>
          </div>
          {importError && (
            <p role="alert" className="mt-2 text-[0.875rem] text-rose-700">
              {importError}
            </p>
          )}
          {pendingImport && (
            <div className="mt-3 rounded-[var(--radius-card)] border border-mist bg-linen p-3.5">
              <p className="text-[0.9375rem] leading-relaxed text-charcoal">
                This replaces everything currently on this device with the journey
                in that file. Consider exporting first — this cannot be undone.
              </p>
              <div className="mt-3 flex gap-2.5">
                <GentleButton variant="danger" size="sm" onClick={confirmImport}>
                  Replace and restore
                </GentleButton>
                <GentleButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingImport(null)}
                >
                  Keep what I have
                </GentleButton>
              </div>
            </div>
          )}
        </PaperCard>

        <SectionTitle>Plus</SectionTitle>
        <PaperCard variant="atmospheric" padding="md">
          <p className="text-[0.9375rem] leading-relaxed text-charcoal">
            BibleQuest is free for everything that matters. Plus deepens the
            experience and supports the mission.
          </p>
          <GentleLink variant="gold" size="sm" href="/app/plus" className="mt-3">
            Explore Plus
          </GentleLink>
        </PaperCard>

        <SectionTitle>About</SectionTitle>
        <PaperCard variant="paper" padding="none" className="overflow-hidden">
          <ul className="divide-y divide-mist/70 text-[0.9375rem]">
            <li>
              <Link href="/about" className="block px-4 py-3.5 text-charcoal hover:bg-linen">
                About BibleQuest
              </Link>
            </li>
            <li>
              <Link href="/terms" className="block px-4 py-3.5 text-charcoal hover:bg-linen">
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="block px-4 py-3.5 text-charcoal hover:bg-linen">
                Privacy Policy
              </Link>
            </li>
          </ul>
        </PaperCard>

        {/* Danger zone — plain, calm, confirmed */}
        <SectionTitle>Start over</SectionTitle>
        <PaperCard variant="paper" padding="md">
          {!confirmClear ? (
            <>
              <p className="text-[0.875rem] leading-relaxed text-ash">
                This clears your prayers, reflections, and journey from this
                device. There is no shame in beginning again — but this cannot be
                undone.
              </p>
              <GentleButton
                variant="danger"
                size="sm"
                className="mt-3"
                onClick={() => setConfirmClear(true)}
              >
                Clear my data
              </GentleButton>
            </>
          ) : (
            <>
              <p className="text-[0.9375rem] text-charcoal">
                Are you sure? Consider exporting your journey first.
              </p>
              <div className="mt-3 flex gap-2.5">
                <GentleButton
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    clearAllData();
                    router.replace("/onboarding");
                  }}
                >
                  Yes, clear everything
                </GentleButton>
                <GentleButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmClear(false)}
                >
                  Keep my journey
                </GentleButton>
              </div>
            </>
          )}
        </PaperCard>
      </PageContainer>
    </>
  );
}

export function SettingsScreen() {
  return (
    <ClientOnly>
      <SettingsInner />
    </ClientOnly>
  );
}
