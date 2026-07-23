"use client";

/**
 * Settings and data-control surface. Preference changes write directly to the
 * persisted QuestOS store; account actions delegate to Supabase; exports,
 * imports, and destructive resets stay explicit and user-confirmed here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuestOS } from "@/lib/questos/store";
import { useToast } from "@/components/design-system/Toast";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageHeader, PageContainer } from "@/components/app-shell/PageHeader";
import { PaperCard } from "@/components/design-system/PaperCard";
import { GentleButton } from "@/components/design-system/GentleButton";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { Avatar } from "@/components/profile/Avatar";
import { applyAppearance } from "@/lib/theme";
import { saveAvatar, clearAvatar } from "@/lib/utils/avatar";
import {
  MAX_IMPORT_FILE_BYTES,
  parseSnapshot,
} from "@/lib/questos/import-schema";
import { createExportSnapshot } from "@/lib/questos/snapshot";
import { clearAllDeviceLocalJournalDrafts } from "@/lib/questos/journal-drafts";
import { clearLastSyncedUserId } from "@/lib/sync/last-user";
import { ACCOUNT_SYNC_CONTAINED } from "@/lib/sync/containment";
import { useSession } from "@/lib/supabase/useSession";
import { deleteOwnAccount } from "@/lib/auth/account-deletion";
import { stopSync } from "@/lib/sync/engine";
import { clearStoredAccountSyncGenerations } from "@/lib/sync/generation";
import { clearStoredDailyQuestSyncContext } from "@/lib/sync/daily-quests";
import { clearStoredMutableRevisionContext } from "@/lib/sync/mutable-revisions";
import type { QuestOSSnapshot } from "@/lib/questos/types";
import { useStrings, LANGUAGES, languageMeta, fmt } from "@/lib/i18n";
import { IconCheck, IconChevronRight } from "@/components/design-system/icons";
import { cn } from "@/lib/utils/cn";
import {
  FEATURED_TRANSLATIONS,
  featuredBibleTranslationOptions,
  translationMetadata,
  translationPreferenceLabel,
  type BibleTranslation,
} from "@/lib/bible/translations";
import { DEFAULT_BIBLE_TRANSLATION_KEY } from "@/lib/bible/defaults";
import { WallpaperPicker } from "@/components/settings/WallpaperPicker";
import { ExplorePlusLink } from "@/components/plus/ExplorePlusLink";
import { DonationLink } from "@/components/plus/DonationLink";
import { useShouldReduceMotion } from "@/lib/use-reduced-motion";
import {
  MAX_GLASS_OPACITY,
  MIN_GLASS_OPACITY,
  normalizeGlassOpacity,
} from "@/lib/glass-opacity";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5">
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
      className="grid w-full grid-flow-col auto-cols-fr gap-1 rounded-[var(--radius-button)] border border-mist bg-linen p-0.5 min-[480px]:w-auto min-[480px]:rounded-full"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 rounded-[7px] px-2 py-1.5 text-center text-[0.75rem] leading-tight transition-all duration-300 min-[360px]:px-3 min-[360px]:text-[0.8125rem] min-[480px]:rounded-full",
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
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
    >
      <span
        aria-hidden="true"
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
      </span>
    </button>
  );
}

/** Adjusts every app-shell glass material while exposing an accessible value. */
function GlassOpacitySlider({
  value,
  glassEnabled,
  onPreview,
  onCommit,
}: {
  value: number;
  glassEnabled: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const normalizedValue = normalizeGlassOpacity(value);
  const [opacity, setOpacity] = useState(normalizedValue);
  const opacityRef = useRef(normalizedValue);
  const committedOpacityRef = useRef(normalizedValue);
  const description = glassEnabled
    ? "15% is the most transparent allowed; 100% is fully solid."
    : "Turn on Glass surfaces to preview this setting. Your choice is saved.";

  // Preview only updates lightweight CSS variables; the full persisted QuestOS
  // snapshot is written once when the pointer or keyboard interaction ends.
  function previewOpacity(nextValue: number) {
    const next = normalizeGlassOpacity(nextValue);
    opacityRef.current = next;
    setOpacity(next);
    onPreview(next);
  }

  function commitOpacity() {
    const next = opacityRef.current;
    if (next === committedOpacityRef.current) return;
    committedOpacityRef.current = next;
    onCommit(next);
  }

  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-4">
        <label
          htmlFor="glass-opacity"
          className="text-[0.9375rem] text-charcoal"
        >
          UI transparency
        </label>
        <output
          htmlFor="glass-opacity"
          className="shrink-0 rounded-full border border-mist bg-linen px-2.5 py-1 text-[0.8125rem] font-medium tabular-nums text-charcoal"
        >
          {opacity}% opacity
        </output>
      </div>
      <input
        id="glass-opacity"
        type="range"
        min={MIN_GLASS_OPACITY}
        max={MAX_GLASS_OPACITY}
        step={1}
        value={opacity}
        aria-describedby="glass-opacity-description"
        aria-valuetext={`${opacity}% opacity`}
        // Native input events keep the glass preview in sync while dragging.
        onInput={(event) =>
          previewOpacity(Number(event.currentTarget.value))
        }
        onPointerUp={commitOpacity}
        onPointerCancel={commitOpacity}
        onKeyUp={commitOpacity}
        onBlur={commitOpacity}
        className="mt-2 h-11 w-full cursor-pointer accent-[var(--color-accent)]"
      />
      <div
        aria-hidden="true"
        className="mt-0.5 flex justify-between text-[0.6875rem] font-medium uppercase tracking-[0.04em] text-ash"
      >
        <span>More transparent</span>
        <span>More solid</span>
      </div>
      <p
        id="glass-opacity-description"
        className="mt-1.5 text-caption leading-relaxed text-ash"
      >
        {description}
      </p>
    </div>
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

interface BibleTranslationCopy {
  label: string;
  preferredSummary: string;
  preferenceDescription: string;
  licensingNote: string;
  availableOffline: string;
  connected: string;
  openOnline: string;
  licensedConnection: string;
  bundledPreferenceDescription: string;
  openPreferenceDescription: string;
  licensedPreferenceDescription: string;
  sourceLicense: string;
  openProviderError: string;
  licensedProviderError: string;
  licensePending: string;
  providerRequired: string;
  checking: string;
  providerError: string;
  searchLabel: string;
  searchPlaceholder: string;
  noMatches: string;
}

const DEFAULT_BIBLE_TRANSLATION_COPY: BibleTranslationCopy = {
  label: "Bible translation",
  preferredSummary: "{translation} preferred",
  preferenceDescription:
    "{translation} is your preference. If its licensed connection is unavailable, BibleQuest uses the public-domain WEB and labels the fallback clearly.",
  licensingNote:
    "Open editions come from BibleQuest’s reviewed HelloAO allowlist. Copyrighted editions appear only when their exact provider IDs are approved for BibleQuest’s commercial use; they are never bundled or sent to quest generation.",
  availableOffline: "Available offline",
  connected: "Connected",
  openOnline: "Open online",
  licensedConnection: "Licensed connection",
  bundledPreferenceDescription:
    "{translation} is bundled with BibleQuest and available offline.",
  openPreferenceDescription:
    "{translation} is an open online edition. If it cannot load, BibleQuest uses the public-domain WEB and labels the fallback clearly.",
  licensedPreferenceDescription:
    "{translation} uses a licensed provider connection. If it is unavailable, BibleQuest shows an attributed open edition or the public-domain WEB fallback.",
  sourceLicense: "Source & license",
  openProviderError:
    "Open online editions could not be checked. WEB remains available offline.",
  licensedProviderError:
    "Licensed editions could not be checked. Open editions and WEB remain available.",
  licensePending: "License pending",
  providerRequired: "Licensed connection required",
  checking: "Checking open and licensed editions…",
  providerError: "Online editions could not be checked. WEB remains available.",
  searchLabel: "Search online languages and editions",
  searchPlaceholder: "Spanish, Chinese, Arabic…",
  noMatches: "No online edition matches that search.",
};

function translationStatus(
  translation: BibleTranslation,
  copy: BibleTranslationCopy,
): string {
  switch (translation.availability) {
    case "bundled":
      return copy.availableOffline;
    case "open":
      return copy.openOnline;
    case "connected":
      return copy.licensedConnection;
    case "license_pending":
      return copy.licensePending;
    default:
      return copy.providerRequired;
  }
}

function translationSourceNotice(translation: BibleTranslation): string {
  if (translation.licenseNotice) return translation.licenseNotice;
  if (translation.source === "local") return "BibleQuest bundled · Public domain";
  if (translation.source === "helloao") return "Open edition · HelloAO";
  return "Licensed edition · API.Bible";
}

function TranslationRow({
  translation,
  checked,
  disabled = false,
  status,
  onChange,
}: {
  translation: BibleTranslation;
  checked: boolean;
  disabled?: boolean;
  status: string;
  onChange: (key: string) => void;
}) {
  return (
    <label className="block cursor-pointer rounded-[10px]">
      <input
        type="radio"
        name="preferred-bible-translation"
        value={translation.key}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(translation.key)}
        className="peer sr-only"
      />
      <span
        className={cn(
          "flex min-h-11 w-full items-start gap-3 rounded-[10px] px-2 py-3 text-left transition-colors",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
          checked ? "bg-accent-surface" : "hover:bg-linen",
          disabled && "cursor-not-allowed opacity-65 hover:bg-transparent",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[0.9375rem] font-medium text-graphite">
              {translation.abbreviation}
            </span>
            <span
              className="text-[0.8125rem] text-charcoal"
              dir={translation.direction}
              lang={translation.languageId}
            >
              {translation.name}
            </span>
          </span>
          <span className="mt-0.5 block text-caption text-ash">
            <span dir={translation.direction} lang={translation.languageId}>
              {translation.languageNameLocal}
            </span>{" "}
            · {status}
          </span>
          <span className="mt-0.5 block text-caption leading-relaxed text-ash">
            {translationSourceNotice(translation)}
          </span>
        </span>
        {checked && (
          <IconCheck size={16} className="mt-0.5 shrink-0 text-accent" />
        )}
      </span>
    </label>
  );
}

function BibleTranslationPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const strings = useStrings();
  const copy: BibleTranslationCopy = {
    ...DEFAULT_BIBLE_TRANSLATION_COPY,
    ...strings.settings.bibleTranslation,
  };
  const [translations, setTranslations] = useState<BibleTranslation[]>(
    FEATURED_TRANSLATIONS,
  );
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<{
    apiBible?: { name: string; configured: boolean; error: boolean };
    helloAo?: { name: string; configured: boolean; error: boolean };
  }>({});
  const [catalogueError, setCatalogueError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/bible/translations", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          translations?: BibleTranslation[];
          provider?: {
            name?: unknown;
            configured?: unknown;
            error?: unknown;
          };
          providers?: {
            apiBible?: {
              name?: unknown;
              configured?: unknown;
              error?: unknown;
            };
            helloAo?: {
              name?: unknown;
              configured?: unknown;
              error?: unknown;
            };
          };
        };
        if (!response.ok || !Array.isArray(body.translations)) throw new Error();
        setTranslations(body.translations);
        const apiBible = body.providers?.apiBible ?? body.provider;
        const helloAo = body.providers?.helloAo;
        setProviders({
          apiBible: apiBible
            ? {
                name:
                  typeof apiBible.name === "string"
                    ? apiBible.name
                    : "API.Bible",
                configured: Boolean(apiBible.configured),
                error: Boolean(apiBible.error),
              }
            : undefined,
          helloAo: helloAo
            ? {
                name:
                  typeof helloAo.name === "string" ? helloAo.name : "HelloAO",
                configured: Boolean(helloAo.configured),
                error: Boolean(helloAo.error),
              }
            : {
                name: "HelloAO",
                configured: true,
                error: false,
              },
        });
        setCatalogueError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogueError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Unconnected copyrighted editions are future integration targets, not
  // usable choices. A legacy selection remains visible (disabled) so its
  // fallback is understandable, while every available choice stays free.
  const featured = featuredBibleTranslationOptions(translations, value);
  const onlineLanguages = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const online = translations.filter(
      (item) =>
        !item.featured &&
        (item.availability === "open" ||
          item.availability === "connected") &&
        (!needle ||
          item.key === value ||
          `${item.name} ${item.abbreviation} ${item.languageName} ${item.languageNameLocal}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
    const groups = new Map<string, BibleTranslation[]>();
    for (const translation of online) {
      const group = groups.get(translation.languageName) ?? [];
      group.push(translation);
      groups.set(translation.languageName, group);
    }
    return [...groups.entries()];
  }, [query, translations, value]);

  const selected =
    translations.find((item) => item.key === value) ??
    translationMetadata(value);
  const hasOnlineCatalogue = translations.some(
    (item) =>
      !item.featured &&
      (item.availability === "open" || item.availability === "connected"),
  );
  const preferenceDescription =
    selected?.source === "local"
      ? copy.bundledPreferenceDescription
      : selected?.source === "helloao"
        ? copy.openPreferenceDescription
        : copy.licensedPreferenceDescription;

  return (
    <fieldset>
      <legend className="sr-only">{copy.label}</legend>
      <div className="rounded-[10px] bg-linen px-3.5 py-3">
        <p className="text-[0.875rem] leading-relaxed text-charcoal">
          {fmt(preferenceDescription, {
            translation:
              selected?.abbreviation ?? translationPreferenceLabel(value),
          })}
        </p>
        {selected?.licenseUrl && (
          <a
            href={selected.licenseUrl}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            lang="en"
            className="mt-1.5 inline-flex min-h-11 items-center text-caption text-accent underline decoration-accent/30 underline-offset-2"
          >
            {copy.sourceLicense} · {selected.abbreviation}
          </a>
        )}
        <p className="mt-1.5 text-caption leading-relaxed text-ash">
          {copy.licensingNote}
        </p>
      </div>

      <div className="mt-3 space-y-1">
        {featured.map(({ translation, disabled }) => (
          <TranslationRow
            key={translation.key}
            translation={translation}
            checked={translation.key === value}
            disabled={disabled}
            status={translationStatus(translation, copy)}
            onChange={onChange}
          />
        ))}
      </div>

      {loading && (
        <p role="status" className="mt-3 text-caption text-ash">
          {copy.checking}
        </p>
      )}
      {catalogueError && (
        <p role="status" className="mt-3 text-caption leading-relaxed text-ash">
          {copy.providerError}
        </p>
      )}
      {!catalogueError && providers.helloAo?.error && (
        <p role="status" className="mt-3 text-caption leading-relaxed text-ash">
          {copy.openProviderError}
        </p>
      )}
      {!catalogueError && providers.apiBible?.error && (
        <p role="status" className="mt-3 text-caption leading-relaxed text-ash">
          {copy.licensedProviderError}
        </p>
      )}

      {hasOnlineCatalogue && (
        <div className="mt-4 border-t border-mist/70 pt-4">
          <label htmlFor="translation-search" className="text-caption text-ash">
            {copy.searchLabel}
          </label>
          <input
            id="translation-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="mt-1.5 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-[0.9375rem] text-graphite outline-none focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
            {onlineLanguages.map(([language, editions]) => (
              <div key={language}>
                <p
                  className="px-2 text-caption uppercase tracking-[0.12em] text-accent"
                  dir="auto"
                >
                  {language}
                </p>
                <div>
                  {editions.map((translation) => (
                    <TranslationRow
                      key={translation.key}
                      translation={translation}
                      checked={translation.key === value}
                      status={translationStatus(translation, copy)}
                      onChange={onChange}
                    />
                  ))}
                </div>
              </div>
            ))}
            {onlineLanguages.length === 0 && (
              <p className="text-caption text-ash">{copy.noMatches}</p>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}

function SettingsInner() {
  const router = useRouter();
  const { toast } = useToast();
  // Signed-in clears/restores must also purge the account copy, or the next
  // initial sync merges it straight back (see lib/sync/engine.ts).
  const { user, loading: sessionLoading } = useSession();
  const profile = useQuestOS((s) => s.profile);
  const settings = useQuestOS((s) => s.settings);
  const updateProfile = useQuestOS((s) => s.updateProfile);
  const updateSettings = useQuestOS((s) => s.updateSettings);
  const clearAllData = useQuestOS((s) => s.clearAllData);
  const importData = useQuestOS((s) => s.importData);
  const store = useQuestOS;

  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] =
    useState<Partial<QuestOSSnapshot> | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const appearance = settings.appearance;
  const shouldReduceMotion = useShouldReduceMotion();
  const t = useStrings();
  const bibleTranslationCopy: BibleTranslationCopy = {
    ...DEFAULT_BIBLE_TRANSLATION_COPY,
    ...t.settings.bibleTranslation,
  };
  const language = settings.language ?? "en";
  const bibleTranslation =
    settings.preferredBibleTranslation ?? DEFAULT_BIBLE_TRANSLATION_KEY;

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
    toast("Exported. The file contains readable journal text—store it securely.");
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file still fires onChange
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setImportError("That journey is too large to restore safely.");
      return;
    }
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

  // Server deletion must succeed before any irreplaceable device data is removed.
  async function deleteAccount() {
    if (
      !user ||
      ACCOUNT_SYNC_CONTAINED ||
      deleteConfirmation !== "DELETE" ||
      deletingAccount
    ) {
      return;
    }
    setDeletingAccount(true);
    setDeleteAccountError(false);

    try {
      await deleteOwnAccount();
    } catch {
      setDeletingAccount(false);
      setDeleteAccountError(true);
      return;
    }

    // Stop every subscriber before removing the deleted account's local copy.
    stopSync();
    clearAllData();
    clearAllDeviceLocalJournalDrafts();
    clearLastSyncedUserId();
    clearStoredAccountSyncGenerations();
    clearStoredDailyQuestSyncContext();
    clearStoredMutableRevisionContext();
    await clearAvatar();
    toast("Your account and saved journey were deleted.", {
      variant: "success",
    });
    router.replace("/onboarding");
  }

  return (
    <>
      <PageHeader title={t.titles.settings} />
      <PageContainer className="pb-8">
        <SectionTitle>{t.settings.profile}</SectionTitle>
        <PaperCard variant="paper" padding="md">
          <div className="flex items-center gap-4 max-[360px]:flex-col max-[360px]:items-stretch sm:gap-5">
            <Avatar
              name={profile?.displayName}
              marker={profile?.avatarUpdatedAt}
              size="lg"
              className="ring-1 ring-paper/70 shadow-[0_8px_24px_rgb(18_33_27_/_0.12)] max-[360px]:self-center"
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
                  <div className="mt-2.5 flex flex-wrap gap-2.5">
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
                  <div className="flex min-h-11 items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-display text-[1.25rem] leading-tight text-graphite">
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
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
            <span className="text-[0.9375rem]">
              {ACCOUNT_SYNC_CONTAINED ? "Account sync" : "Sync across devices"}
            </span>
            <span className="flex items-center gap-1 text-[0.8125rem] text-ash">
              {ACCOUNT_SYNC_CONTAINED
                ? "Temporarily unavailable"
                : sessionLoading
                  ? "Checking…"
                  : user
                    ? "Signed in"
                    : "Set up sync"}
              <IconChevronRight size={15} />
            </span>
          </Link>
          {!ACCOUNT_SYNC_CONTAINED && user && (
            <div className="border-t border-mist/70 px-4 py-4">
              {!confirmDeleteAccount ? (
                <>
                  <p className="text-[0.875rem] leading-relaxed text-ash">
                    Permanently close your login and delete its synced journey.
                    This device’s journey will also be cleared.
                  </p>
                  <GentleButton
                    variant="danger"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setDeleteAccountError(false);
                      setConfirmDeleteAccount(true);
                    }}
                  >
                    Delete account
                  </GentleButton>
                </>
              ) : (
                <>
                  <p className="text-[0.9375rem] leading-relaxed text-charcoal">
                    This permanently deletes your account, prayers,
                    reflections, progress, and this device’s journey. It can’t
                    be undone.
                  </p>
                  <label
                    htmlFor="delete-account-confirmation"
                    className="mt-3 block text-caption text-ash"
                  >
                    Type DELETE to confirm
                  </label>
                  <input
                    id="delete-account-confirmation"
                    value={deleteConfirmation}
                    onChange={(event) => {
                      setDeleteConfirmation(event.target.value);
                      setDeleteAccountError(false);
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={deletingAccount}
                    className="mt-1.5 w-full rounded-[var(--radius-button)] border border-mist bg-linen px-3.5 py-2.5 text-body text-graphite outline-none focus:border-accent/50"
                  />
                  {deleteAccountError && (
                    <p role="alert" className="mt-2 text-caption text-rose-700">
                      We couldn’t delete your account. Nothing on this device
                      was removed. Check your connection and try again.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    <GentleButton
                      variant="danger"
                      size="sm"
                      disabled={
                        deleteConfirmation !== "DELETE" || deletingAccount
                      }
                      aria-busy={deletingAccount}
                      onClick={() => void deleteAccount()}
                    >
                      {deletingAccount
                        ? "Deleting account…"
                        : "Permanently delete account"}
                    </GentleButton>
                    <GentleButton
                      variant="ghost"
                      size="sm"
                      disabled={deletingAccount}
                      onClick={() => {
                        setConfirmDeleteAccount(false);
                        setDeleteConfirmation("");
                        setDeleteAccountError(false);
                      }}
                    >
                      Keep my account
                    </GentleButton>
                  </div>
                </>
              )}
            </div>
          )}
        </PaperCard>

        {/* Always visible — text size and bold text are comfort settings
            people shouldn't have to hunt for behind a disclosure. */}
        <section id="appearance" className="scroll-mt-6">
          <SectionTitle>{t.settings.appearance}</SectionTitle>
          <PaperCard
            variant="paper"
            padding="none"
            className="overflow-hidden px-4"
          >
            <WallpaperPicker
              value={appearance.wallpaperId}
              onChange={(wallpaperId) => setAppearance({ wallpaperId })}
            />
            <div className="divide-y divide-mist/70">
              <Row label="Wallpaper style">
                <Segmented
                  label="Wallpaper style"
                  value={appearance.wallpaperMode}
                  onChange={(wallpaperMode) => setAppearance({ wallpaperMode })}
                  options={[
                    { value: "still", label: "Still" },
                    { value: "live", label: "Live" },
                  ]}
                />
              </Row>
              <Row label="Glass surfaces">
                <Toggle
                  label="Glass surfaces"
                  on={appearance.glassSurfaces}
                  onChange={(glassSurfaces) => setAppearance({ glassSurfaces })}
                />
              </Row>
              <GlassOpacitySlider
                // A durable external change remounts the short-lived drag draft.
                key={appearance.glassOpacity}
                value={appearance.glassOpacity}
                glassEnabled={appearance.glassSurfaces}
                onPreview={(glassOpacity) =>
                  applyAppearance({ ...appearance, glassOpacity })
                }
                onCommit={(glassOpacity) => setAppearance({ glassOpacity })}
              />
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
            {appearance.wallpaperMode === "live" && shouldReduceMotion && (
              <p className="border-t border-mist/70 py-3 text-caption leading-relaxed text-ash">
                Live is saved as your preference. The matching still is shown
                while {appearance.reducedMotion
                  ? "Reduce Motion is"
                  : "your device’s Reduce Motion setting is"} on.
              </p>
            )}
          </PaperCard>
        </section>

        <DisclosureGroup className="mt-6">
          <Disclosure
            variant="card"
            label={bibleTranslationCopy.label}
            summary={
              <span className="text-[0.8125rem] text-ash">
                {fmt(bibleTranslationCopy.preferredSummary, {
                  translation: translationPreferenceLabel(bibleTranslation),
                })}
              </span>
            }
          >
            <BibleTranslationPicker
              value={bibleTranslation}
              onChange={(preferredBibleTranslation) =>
                updateSettings({ preferredBibleTranslation })
              }
            />
          </Disclosure>

          <Disclosure
            variant="card"
            label={
              <span className="inline-flex items-center gap-2">
                {t.settings.language}
                <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-accent">
                  Beta
                </span>
              </span>
            }
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
            <p className="mt-2 text-[0.75rem] leading-relaxed text-ash">
              Exports contain readable prayers and reflections. Store the file
              somewhere secure.
            </p>
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
                  Terms of Use
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
        <div className="space-y-3">
          <ExplorePlusLink description="Discover the full wallpaper collection and extra ways to deepen your daily practice." />
          <DonationLink />
        </div>

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
                    clearAllDeviceLocalJournalDrafts();
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
