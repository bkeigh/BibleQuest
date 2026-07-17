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
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { Avatar } from "@/components/profile/Avatar";
import { applyAppearance } from "@/lib/theme";
import { saveAvatar, clearAvatar } from "@/lib/utils/avatar";
import { parseSnapshot } from "@/lib/questos/import-schema";
import { createExportSnapshot } from "@/lib/questos/snapshot";
import { clearLastSyncedUserId } from "@/lib/sync/last-user";
import { useSession } from "@/lib/supabase/useSession";
import type { QuestOSSnapshot } from "@/lib/questos/types";
import { useStrings, LANGUAGES, languageMeta } from "@/lib/i18n";
import { IconCheck } from "@/components/design-system/icons";
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
  label,
  value,
  options,
  onChange,
}: {
  /** Accessible name for the control group. */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 rounded-full border border-mist bg-linen p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
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

function Toggle({
  label,
  on,
  onChange,
}: {
  /** Accessible name — the switch is announced with this. */
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors duration-300",
        on ? "bg-evergreen-600" : "bg-mist"
      )}
    >
      {/* moon-paper doesn't flip in Candle mode, so the knob stays visible
          against both the mist off-track and the evergreen on-track. */}
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-moon-paper paper-shadow transition-all duration-300",
          on ? "left-[1.375rem]" : "left-0.5"
        )}
      />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-7 px-1 font-pixel text-[1.375rem] leading-tight uppercase tracking-[0.05em] text-accent">
      {children}
    </h2>
  );
}

function LanguagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  // Proper ARIA radio pattern: one Tab stop, arrows move + select.
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    LANGUAGES.findIndex((l) => l.code === value)
  );

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      next = (index + 1) % LANGUAGES.length;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      next = (index - 1 + LANGUAGES.length) % LANGUAGES.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = LANGUAGES.length - 1;
    }
    if (next !== null) {
      e.preventDefault();
      onChange(LANGUAGES[next].code);
      refs.current[next]?.focus();
    }
  }

  return (
    <div role="radiogroup" aria-label="App language" className="divide-y divide-mist/60">
      {LANGUAGES.map((l, i) => {
        const selected = l.code === value;
        return (
          <button
            key={l.code}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={i === selectedIndex ? 0 : -1}
            lang={l.code}
            onClick={() => onChange(l.code)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors duration-200",
              selected ? "text-graphite" : "text-charcoal hover:text-graphite"
            )}
          >
            <span className="flex min-w-0 items-baseline gap-2.5">
              <span className="text-[0.9375rem]">{l.endonym}</span>
              {l.code !== "en" && (
                <span className="truncate text-[0.8125rem] text-ash" lang="en">
                  {l.english}
                </span>
              )}
            </span>
            {selected && <IconCheck size={16} className="shrink-0 text-accent" />}
          </button>
        );
      })}
    </div>
  );
}

function SettingsInner() {
  const router = useRouter();
  const { toast } = useToast();
  // Signed-in clears/restores must also purge the account copy, or the next
  // initial sync merges it straight back (see lib/sync/engine.ts).
  const { user } = useSession();
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);
  const updateProfile = useQuestOS((s) => s.updateProfile);
  const updateSettings = useQuestOS((s) => s.updateSettings);
  const clearAllData = useQuestOS((s) => s.clearAllData);
  const importData = useQuestOS((s) => s.importData);
  const store = useQuestOS;

  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] =
    useState<Partial<QuestOSSnapshot> | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const appearance = settings.appearance;
  const t = useStrings();
  const language = settings.language ?? "en";

  function setAppearance(patch: Partial<typeof appearance>) {
    const next = { ...appearance, ...patch };
    updateSettings({ appearance: next });
    applyAppearance(next);
  }

  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    updateProfile({ displayName: trimmed });
    setEditingName(false);
  }

  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file still fires onChange
    if (!file) return;
    const ok = await saveAvatar(file);
    if (ok) {
      // The photo lives in IndexedDB; the store only carries this marker so
      // Avatar knows to refetch (and it syncs/exports as a harmless string).
      updateProfile({ avatarUpdatedAt: new Date().toISOString() });
      toast(t.settings.photoSaved, { variant: "success" });
    } else {
      toast(t.settings.photoError);
    }
  }

  async function removePhoto() {
    await clearAvatar();
    updateProfile({ avatarUpdatedAt: null });
  }

  function exportData() {
    const data = createExportSnapshot(store.getState());
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "biblequest-journey.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported. Keep the file somewhere safe.");
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
    importData(
      pendingImport,
      user ? { purgeAccount: user.id } : undefined
    );
    // A restore whose profile carries no photo marker must not resurrect a
    // stale on-device photo blob for the incoming profile.
    if (!pendingImport.profile?.avatarUpdatedAt) void clearAvatar();
    setPendingImport(null);
    applyAppearance(store.getState().settings.appearance);
    toast("Restored.", { variant: "success" });
  }

  return (
    <>
      <PageHeader title={t.titles.settings} />
      <PageContainer className="pb-8">
        <SectionTitle>{t.settings.profile}</SectionTitle>
        <PaperCard variant="paper" padding="md">
          <div className="flex items-start gap-4">
            <Avatar
              name={profile?.displayName}
              marker={profile?.avatarUpdatedAt}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              {editingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveName();
                  }}
                >
                  <label
                    htmlFor="display-name"
                    className="mb-1.5 block text-[0.8125rem] text-ash"
                  >
                    {t.settings.displayName}
                  </label>
                  <input
                    id="display-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Escape" && setEditingName(false)
                    }
                    maxLength={40}
                    autoFocus
                    autoComplete="given-name"
                    className="w-full rounded-[var(--radius-button)] border border-mist bg-paper px-4 py-2.5 text-[0.9375rem] text-graphite outline-none transition-colors focus:border-accent/50"
                  />
                  <div className="mt-2.5 flex gap-2.5">
                    <GentleButton
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="min-h-11"
                      disabled={!nameDraft.trim()}
                    >
                      {t.common.save}
                    </GentleButton>
                    <GentleButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setEditingName(false)}
                    >
                      {t.common.cancel}
                    </GentleButton>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[1.0625rem] font-medium text-graphite">
                      {profile?.displayName}
                    </p>
                    <GentleButton
                      variant="text"
                      size="sm"
                      className="min-h-11 shrink-0"
                      onClick={() => {
                        setNameDraft(profile?.displayName ?? "");
                        setEditingName(true);
                      }}
                    >
                      {t.common.edit}
                    </GentleButton>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      // Proxy-triggered by the visible button; without this
                      // the sr-only input is an invisible tab stop.
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={onPhotoPicked}
                    />
                    <GentleButton
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      {t.settings.changePhoto}
                    </GentleButton>
                    {profile?.avatarUpdatedAt && (
                      <GentleButton
                        variant="text"
                        size="sm"
                        className="min-h-11"
                        onClick={removePhoto}
                      >
                        {t.settings.removePhoto}
                      </GentleButton>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </PaperCard>

        <SectionTitle>{t.settings.account}</SectionTitle>
        <PaperCard variant="paper" padding="none" className="overflow-hidden">
          <Link
            href="/app/account"
            className="flex items-center justify-between px-4 py-3.5 text-charcoal hover:bg-linen"
          >
            <span className="text-[0.9375rem]">Sync across devices</span>
            <span className="text-[0.8125rem] text-ash">Optional</span>
          </Link>
        </PaperCard>

        {/* Always visible — text size and bold text are comfort settings
            people shouldn't have to hunt for behind a disclosure. */}
        <SectionTitle>{t.settings.appearance}</SectionTitle>
        <PaperCard variant="paper" padding="none" className="px-4">
          <div className="divide-y divide-mist/70">
            <Row label={t.settings.theme}>
              <Segmented
                label={t.settings.theme}
                value={appearance.theme}
                onChange={(theme) => setAppearance({ theme })}
                options={[
                  { value: "light", label: t.settings.themeLight },
                  { value: "dark", label: t.settings.themeDark },
                  { value: "system", label: t.settings.themeSystem },
                ]}
              />
            </Row>
            <Row label={t.settings.textSize}>
              <Segmented
                label={t.settings.textSize}
                value={appearance.textSize}
                onChange={(textSize) => setAppearance({ textSize })}
                options={[
                  { value: "default", label: t.settings.textSizeDefault },
                  { value: "large", label: t.settings.textSizeLarge },
                ]}
              />
            </Row>
            <Row label={t.settings.boldText}>
              <Toggle
                label={t.settings.boldText}
                on={appearance.boldText}
                onChange={(boldText) => setAppearance({ boldText })}
              />
            </Row>
            <Row label={t.settings.reduceMotion}>
              <Toggle
                label={t.settings.reduceMotion}
                on={appearance.reducedMotion}
                onChange={(reducedMotion) => setAppearance({ reducedMotion })}
              />
            </Row>
          </div>
        </PaperCard>

        <DisclosureGroup className="mt-6">
          <Disclosure
            variant="card"
            label={t.settings.language}
            summary={<span className="text-[0.8125rem] text-ash">{languageMeta(language).endonym}</span>}
          >
            <p className="pb-1 text-[0.875rem] leading-relaxed text-ash">
              {t.settings.languageNote}
            </p>
            <LanguagePicker
              value={language}
              onChange={(code) => updateSettings({ language: code })}
            />
          </Disclosure>

          <Disclosure variant="card" label={t.settings.reminders}>
            <p className="text-[0.875rem] leading-relaxed text-ash">
              Reminders are coming soon. When they arrive, they’ll be
              invitations — never pressure, never streak warnings. You’ll choose
              exactly what and when.
            </p>
          </Disclosure>

          <Disclosure variant="card" label="Privacy & data">
            <p className="text-[0.9375rem] leading-relaxed text-charcoal">
              Your prayers and reflections are private by default. On this device
              they’re stored only for you. Analytics are off until you choose to
              share limited usage counts, and never include prayer or journal text.
            </p>
            <div className="mt-4 flex items-start justify-between gap-4 border-t border-mist/70 pt-4">
              <div className="min-w-0">
                <p className="text-[0.9375rem] text-graphite">
                  {t.settings.analyticsToggle}
                </p>
                <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ash">
                  {t.settings.analyticsNote}
                </p>
              </div>
              <Toggle
                label={t.settings.analyticsToggle}
                on={settings.analyticsConsent}
                onChange={(analyticsConsent) =>
                  updateSettings({ analyticsConsent })
                }
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <GentleButton variant="outline" size="sm" onClick={exportData}>
                {t.settings.exportData}
              </GentleButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                // Proxy-triggered by the visible button below.
                tabIndex={-1}
                aria-hidden="true"
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
                {t.settings.importData}
              </GentleButton>
              <Link
                href="/privacy"
                className="inline-flex items-center px-1 text-[0.875rem] text-accent hover:text-accent/80"
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
                  {user
                    ? "This replaces everything on this device — and the synced copy in your account — with the data in that file. Consider exporting first — it can’t be undone."
                    : "This replaces everything on this device with the data in that file. Consider exporting first — it can’t be undone."}
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
          </Disclosure>

          <Disclosure variant="card" label="About">
            <ul className="divide-y divide-mist/70 text-[0.9375rem]">
              <li>
                <Link href="/about" className="block py-3 text-charcoal hover:text-accent">
                  About BibleQuest
                </Link>
              </li>
              <li>
                <Link href="/terms" className="block py-3 text-charcoal hover:text-accent">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="block py-3 text-charcoal hover:text-accent">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </Disclosure>
        </DisclosureGroup>

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

        {/* Danger zone — plain, calm, confirmed */}
        <SectionTitle>Start over</SectionTitle>
        <PaperCard variant="paper" padding="md">
          {!confirmClear ? (
            <>
              <p className="text-[0.875rem] leading-relaxed text-ash">
                {user
                  ? "This deletes everything on this device and the synced copy in your account — prayers, reflections, and your journey. It can’t be undone."
                  : "This deletes everything on this device — prayers, reflections, and your journey. It can’t be undone."}
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
                Are you sure? Consider exporting your data first.
              </p>
              <div className="mt-3 flex gap-2.5">
                <GentleButton
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    // Signed in, the purge marker condemns the account copy
                    // too; the sync engine deletes it on the next push or
                    // initial sync, even if that happens after a reload.
                    clearAllData(user ? { purgeAccount: user.id } : undefined);
                    // "Everything on this device" includes the profile photo,
                    // which lives beside the store in IndexedDB.
                    void clearAvatar();
                    // The device no longer holds anyone's journey — drop the
                    // sync-ownership marker so the next sign-in isn't asked
                    // about data that no longer exists. (If still signed in,
                    // the next successful push re-stamps it.)
                    clearLastSyncedUserId();
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
                  Keep my data
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
