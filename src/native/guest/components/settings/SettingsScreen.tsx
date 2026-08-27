"use client";

/**
 * Device-only settings for the installed guest app.
 *
 * Preferences, profile details, backups, reminders, and destructive cleanup
 * stay on this device. This module deliberately has no identity or commerce
 * path.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientOnly } from "@/components/app-shell/ClientOnly";
import { PageContainer, PageHeader } from "@/components/app-shell/PageHeader";
import { Avatar } from "@/components/profile/Avatar";
import { GentleButton } from "@/components/design-system/GentleButton";
import { IconCheck, IconChevronRight } from "@/components/design-system/icons";
import { PaperCard } from "@/components/design-system/PaperCard";
import { SearchClearButton } from "@/components/design-system/SearchClearButton";
import { Disclosure, DisclosureGroup } from "@/components/design-system/Disclosure";
import { useToast } from "@/components/design-system/Toast";
import { NativeReminderSettings } from "@/components/settings/NativeReminderSettings";
import { applyAppearance } from "@/lib/appearance/theme";
import {
  MAX_GLASS_OPACITY,
  MIN_GLASS_OPACITY,
  normalizeGlassOpacity,
} from "@/lib/appearance/glass-opacity";
import { THEME_CHOICES, type ThemeId } from "@/lib/appearance/themes";
import { withDeadline } from "@/lib/async/deadline";
import {
  createDeviceBackupExtras,
  DEVICE_BACKUP_KEY,
  parseDeviceBackupExtras,
  type DeviceBackupExtras,
} from "@/lib/backup/device-extras";
import { DEFAULT_BIBLE_TRANSLATION_KEY } from "@/lib/bible/defaults";
import {
  FEATURED_TRANSLATIONS,
  featuredBibleTranslationOptions,
  htmlLanguageTag,
  translationMetadata,
  translationPreferenceLabel,
  type BibleTranslation,
} from "@/lib/bible/translations";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_HREF } from "@/lib/brand";
import { GREEN_FEATURES } from "@/lib/features/green";
import { fmt, LANGUAGES, languageMeta, useStrings } from "@/lib/i18n";
import {
  purgeJourneyBackup,
  resumeJourneyBackupAfterPurge,
} from "@/lib/native/journey-backup";
import { purgeNativeReminders } from "@/lib/native/reminders";
import { apiFetch, buildPublicHref } from "@/lib/platform/api";
import {
  MAX_IMPORT_FILE_BYTES,
  parseSnapshot,
} from "@/lib/questos/import-schema";
import { clearAllDeviceLocalJournalDrafts } from "@/lib/questos/journal-drafts";
import { createExportSnapshot } from "@/lib/questos/snapshot";
import { useQuestOS } from "@/lib/questos/store";
import type { QuestOSSnapshot } from "@/lib/questos/types";
import {
  clearRhythmState,
  readRhythmState,
  replaceRhythmState,
} from "@/lib/rhythm/client";
import { cn } from "@/lib/utils/cn";
import {
  clearAvatar,
  clearLegacyAvatar,
  profileAvatarMarker,
} from "@/lib/utils/avatar";

interface PendingJourneyImport {
  journey: Partial<QuestOSSnapshot>;
  device: DeviceBackupExtras | null;
}

const CLEAR_DATA_DEADLINE_MS = 8_000;

/** Lists the fixed legacy guest records stored outside the main journey. */
const STANDALONE_GAME_STORAGE_KEYS = Object.freeze([
  "biblequest:scripture-games:v1",
  "biblequest:seven-days-match:v1",
  "biblequest:seven-days-match:tutorial:v1",
  "biblequest:arcade-boosts:v1",
]);

/** Renders one setting label beside its control. */
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

/** Shows the four visual themes and the device-matching choice. */
function ThemePicker({
  label,
  systemLabel,
  names,
  value,
  onChange,
}: {
  label: string;
  systemLabel: string;
  names: Record<Exclude<ThemeId, "system">, string>;
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    THEME_CHOICES.findIndex((choice) => choice.id === value),
  );

  /** Moves through the radio choices with standard keyboard keys. */
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % THEME_CHOICES.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + THEME_CHOICES.length) % THEME_CHOICES.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = THEME_CHOICES.length - 1;
    }
    if (next === null) return;
    event.preventDefault();
    onChange(THEME_CHOICES[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div className="py-3.5">
      <span className="block text-[0.9375rem] text-charcoal">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      >
        {THEME_CHOICES.map((choice, index) => {
          const active = value === choice.id;
          return (
            <button
              key={choice.id}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={index === selectedIndex ? 0 : -1}
              onClick={() => onChange(choice.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "rounded-[var(--radius-button)] border p-2 text-start transition-colors duration-300",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "border-accent bg-accent-surface"
                  : "border-mist bg-paper hover:border-accent/45",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-10 w-full items-end gap-1 rounded-[8px] p-1.5 ring-1",
                  THEME_SWATCH[choice.id],
                )}
              >
                <span className="h-full w-1/2 rounded-[3px] bg-current opacity-90" />
                <span className="h-1/2 w-1/4 self-end rounded-[3px] bg-current opacity-45" />
              </span>
              <span className="mt-1.5 block text-caption font-medium text-graphite">
                {names[choice.id]}
              </span>
            </button>
          );
        })}
      </div>
      <label className="mt-3 flex items-center justify-between gap-4">
        <span className="text-[0.9375rem] text-charcoal">{systemLabel}</span>
        <Toggle
          label={systemLabel}
          on={value === "system"}
          onChange={(on) => onChange(on ? "system" : "paper")}
        />
      </label>
    </div>
  );
}

/** Maps each theme to its preview colors. */
const THEME_SWATCH: Record<Exclude<ThemeId, "system">, string> = {
  paper: "bg-[#faf6ec] text-[#2d2a24] ring-[#e4dcc6]",
  candlelight: "bg-[#101814] text-[#e9e4d3] ring-[#2e3a31]",
  light: "bg-[#f6f7f8] text-[#16181c] ring-[#dde1e6]",
  dark: "bg-[#0e0f11] text-[#f2f4f6] ring-[#2c3137]",
};

/** Renders a compact set of mutually exclusive choices. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid w-full grid-flow-col auto-cols-fr gap-1 rounded-[var(--radius-button)] border border-mist bg-linen p-0.5 min-[480px]:w-auto min-[480px]:rounded-full"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-11 rounded-[7px] px-2 py-1.5 text-center text-[0.75rem] leading-tight transition-all duration-300 min-[360px]:px-3 min-[360px]:text-[0.8125rem] min-[480px]:rounded-full",
            value === option.value
              ? "bg-paper text-graphite paper-shadow"
              : "text-ash hover:text-charcoal",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Renders an accessible on-or-off control. */
function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (value: boolean) => void;
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
          on ? "bg-evergreen-600" : "bg-mist",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-moon-paper paper-shadow transition-all duration-300",
            on ? "left-[1.375rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Previews glass opacity and saves it when the interaction ends. */
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

  /** Updates only the visual preview during a drag. */
  function previewOpacity(nextValue: number) {
    const next = normalizeGlassOpacity(nextValue);
    opacityRef.current = next;
    setOpacity(next);
    onPreview(next);
  }

  /** Saves the final value once per completed interaction. */
  function commitOpacity() {
    const next = opacityRef.current;
    if (next === committedOpacityRef.current) return;
    committedOpacityRef.current = next;
    onCommit(next);
  }

  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="glass-opacity" className="text-[0.9375rem] text-charcoal">
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
        onInput={(event) => previewOpacity(Number(event.currentTarget.value))}
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

/** Labels the main groups on the page. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-7 px-1 font-art-label text-[1.375rem] leading-tight uppercase tracking-[0.05em] text-accent">
      {children}
    </h2>
  );
}

/** Lets readers choose an app language with a standard radio pattern. */
function LanguagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    LANGUAGES.findIndex((language) => language.code === value),
  );

  /** Moves and selects with arrow, Home, and End keys. */
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = (index + 1) % LANGUAGES.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = (index - 1 + LANGUAGES.length) % LANGUAGES.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = LANGUAGES.length - 1;
    }
    if (next === null) return;
    event.preventDefault();
    onChange(LANGUAGES[next].code);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="App language" className="divide-y divide-mist/60">
      {LANGUAGES.map((language, index) => {
        const selected = language.code === value;
        return (
          <button
            key={language.code}
            ref={(element) => {
              refs.current[index] = element;
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={index === selectedIndex ? 0 : -1}
            lang={language.code}
            onClick={() => onChange(language.code)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors duration-200",
              selected ? "text-graphite" : "text-charcoal hover:text-graphite",
            )}
          >
            <span className="flex min-w-0 items-baseline gap-2.5">
              <span className="text-[0.9375rem]">{language.endonym}</span>
              {language.code !== "en" && (
                <span className="truncate text-[0.8125rem] text-ash" lang="en">
                  {language.english}
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
  licensingNote: string;
  availableOffline: string;
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
  licensingNote:
    "Open editions come from BibleQuest’s reviewed HelloAO allowlist. Copyrighted editions appear only when their exact provider IDs are approved for BibleQuest’s commercial use; they are never bundled or sent to quest generation.",
  availableOffline: "Available offline",
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

/** Gives one edition its plain availability label. */
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

/** Names the reviewed source behind one edition. */
function translationSourceNotice(translation: BibleTranslation): string {
  if (translation.licenseNotice) return translation.licenseNotice;
  if (translation.source === "local") return "BibleQuest bundled · Public domain";
  if (translation.source === "helloao") return "Open edition · HelloAO";
  return "Licensed edition · API.Bible";
}

/** Renders one Bible edition choice with source details. */
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
              lang={htmlLanguageTag(translation.languageId)}
            >
              {translation.name}
            </span>
          </span>
          <span className="mt-0.5 block text-caption text-ash">
            <span
              dir={translation.direction}
              lang={htmlLanguageTag(translation.languageId)}
            >
              {translation.languageNameLocal}
            </span>{" "}
            · {status}
          </span>
          <span className="mt-0.5 block text-caption leading-relaxed text-ash">
            {translationSourceNotice(translation)}
          </span>
        </span>
        {checked && <IconCheck size={16} className="mt-0.5 shrink-0 text-accent" />}
      </span>
    </label>
  );
}

/** Loads the public edition list while keeping WEB available offline. */
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
    apiBible?: { error: boolean };
    helloAo?: { error: boolean };
  }>({});
  const [catalogueError, setCatalogueError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/api/bible/translations", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          translations?: BibleTranslation[];
          provider?: { error?: unknown };
          providers?: {
            apiBible?: { error?: unknown };
            helloAo?: { error?: unknown };
          };
        };
        if (!response.ok || !Array.isArray(body.translations)) throw new Error();
        setTranslations(body.translations);
        setProviders({
          apiBible: body.providers?.apiBible ?? body.provider
            ? { error: Boolean((body.providers?.apiBible ?? body.provider)?.error) }
            : undefined,
          helloAo: body.providers?.helloAo
            ? { error: Boolean(body.providers.helloAo.error) }
            : { error: false },
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

  const featured = featuredBibleTranslationOptions(translations, value);
  const onlineLanguages = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const online = translations.filter(
      (item) =>
        !item.featured &&
        (item.availability === "open" || item.availability === "connected") &&
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
    translations.find((item) => item.key === value) ?? translationMetadata(value);
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
            translation: selected?.abbreviation ?? translationPreferenceLabel(value),
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
          <div className="relative mt-1.5">
            <input
              id="translation-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="w-full rounded-[var(--radius-button)] border border-mist bg-linen py-2.5 pl-3.5 pr-12 text-[0.9375rem] text-graphite outline-none focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <SearchClearButton
              inputId="translation-search"
              visible={query.length > 0}
              onClear={() => setQuery("")}
              label="Clear Bible translation search"
            />
          </div>
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

/** Clears game progress and small game-only records kept outside the journey. */
async function clearStandaloneGameData(): Promise<boolean> {
  try {
    const storage = window.localStorage;
    for (const key of STANDALONE_GAME_STORAGE_KEYS) {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Renders guest preferences and device-data controls. */
function SettingsInner() {
  const router = useRouter();
  const { toast } = useToast();
  const profile = useQuestOS((state) => state.profile);
  const settings = useQuestOS((state) => state.settings);
  const updateProfile = useQuestOS((state) => state.updateProfile);
  const updateSettings = useQuestOS((state) => state.updateSettings);
  const clearAllData = useQuestOS((state) => state.clearAllData);
  const importData = useQuestOS((state) => state.importData);
  const store = useQuestOS;

  const [confirmClear, setConfirmClear] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] =
    useState<PendingJourneyImport | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const appearance = settings.appearance;
  const strings = useStrings();
  const bibleTranslationCopy: BibleTranslationCopy = {
    ...DEFAULT_BIBLE_TRANSLATION_COPY,
    ...strings.settings.bibleTranslation,
  };
  const language = settings.language ?? "en";
  const bibleTranslation =
    settings.preferredBibleTranslation ?? DEFAULT_BIBLE_TRANSLATION_KEY;
  const themeNames: Record<Exclude<ThemeId, "system">, string> = {
    paper: strings.settings.themePaper,
    candlelight: strings.settings.themeDark,
    light: strings.settings.themeLight,
    dark: strings.settings.themePlainDark,
  };
  const appearanceSummary =
    appearance.theme === "system"
      ? strings.settings.themeSystem
      : themeNames[appearance.theme];

  /** Opens Appearance when another screen links to its page fragment. */
  useEffect(() => {
    let frame = 0;
    function openFromHash() {
      if (window.location.hash !== "#appearance") return;
      setAppearanceOpen(true);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const node = document.getElementById("appearance");
        if (!node) return;
        const still =
          window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
          document.documentElement.classList.contains("force-reduce-motion");
        node.scrollIntoView({
          behavior: still ? "auto" : "smooth",
          block: "start",
        });
      });
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    window.addEventListener("popstate", openFromHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", openFromHash);
      window.removeEventListener("popstate", openFromHash);
    };
  }, []);

  /** Saves and immediately applies one appearance change. */
  function setAppearance(patch: Partial<typeof appearance>) {
    const next = { ...appearance, ...patch };
    updateSettings({ appearance: next });
    applyAppearance(next);
  }

  /** Saves a non-empty display name. */
  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    updateProfile({ displayName: trimmed });
    setEditingName(false);
  }

  /** Removes the local profile image and its old cache format. */
  async function removePhoto() {
    if (photoBusy) return;
    setPhotoBusy(true);
    const currentMarker = profileAvatarMarker(profile);
    try {
      if (currentMarker) await clearAvatar(currentMarker);
      await clearLegacyAvatar();
      updateProfile({ avatarVersion: null, avatarUpdatedAt: null });
    } catch {
      toast(strings.settings.photoError);
    } finally {
      setPhotoBusy(false);
    }
  }

  /** Downloads the journey together with device-only rhythm data. */
  function exportData() {
    const data = {
      ...createExportSnapshot(store.getState()),
      [DEVICE_BACKUP_KEY]: createDeviceBackupExtras(readRhythmState()),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "biblequest-journey.json";
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Exported. The file contains readable journal text—store it securely.");
  }

  /** Validates one selected journey file before asking for confirmation. */
  async function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = event.target.files?.[0];
    event.target.value = "";
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
    const device = parseDeviceBackupExtras(text);
    if (!device.ok) {
      setImportError(device.error);
      return;
    }
    setPendingImport({ journey: result.data, device: device.data });
  }

  /** Replaces the device journey and restores its rhythm extra. */
  async function confirmImport() {
    if (!pendingImport) return;
    importData(pendingImport.journey);
    const rhythmRestored = await (pendingImport.device
      ? replaceRhythmState(pendingImport.device.rhythm)
      : clearRhythmState());
    if (
      !pendingImport.journey.profile?.avatarVersion &&
      !pendingImport.journey.profile?.avatarUpdatedAt
    ) {
      void clearAvatar();
    }
    setPendingImport(null);
    applyAppearance(store.getState().settings.appearance);
    toast(
      rhythmRestored
        ? "Restored."
        : "Journey restored, but this device could not update its rhythm.",
      { variant: rhythmRestored ? "success" : "default" },
    );
  }

  /** Clears the durable mirror before removing every local journey store. */
  async function clearJourneyData() {
    if (clearingData) return;
    setClearingData(true);
    let deviceCleanupFailed = false;
    let journeyCleared = false;
    try {
      const mirrorPurged = await withDeadline(
        purgeJourneyBackup(),
        CLEAR_DATA_DEADLINE_MS,
        "Native journey backup purge",
      );
      if (!mirrorPurged) {
        throw new Error("native journey backup could not be purged");
      }
      try {
        await withDeadline(
          purgeNativeReminders(),
          CLEAR_DATA_DEADLINE_MS,
          "Native reminder cleanup",
        );
      } catch {
        deviceCleanupFailed = true;
      }

      clearAllData();
      journeyCleared = true;
      const draftCount = await clearAllDeviceLocalJournalDrafts();
      const rhythmCleared = await clearRhythmState();
      const gamesCleared = await clearStandaloneGameData();
      if (draftCount < 0 || !rhythmCleared || !gamesCleared) {
        deviceCleanupFailed = true;
      }
      try {
        await withDeadline(
          clearAvatar(),
          CLEAR_DATA_DEADLINE_MS,
          "Local avatar cleanup",
        );
      } catch {
        deviceCleanupFailed = true;
      }

      toast(
        deviceCleanupFailed
          ? "Your journey was cleared, but some device-only cleanup could not finish. Restart BibleQuest before continuing."
          : "Your BibleQuest journey was cleared.",
        { variant: deviceCleanupFailed ? "default" : "success" },
      );
      router.replace("/onboarding");
    } catch {
      toast(
        journeyCleared
          ? "Your journey was cleared, but this device could not finish cleanup. Restart BibleQuest before continuing."
          : "BibleQuest could not safely clear your journey. Your saved journey remains on this device; restart the app and try again.",
      );
    } finally {
      resumeJourneyBackupAfterPurge();
      setConfirmClear(false);
      setClearingData(false);
    }
  }

  return (
    <>
      <PageHeader title={strings.titles.settings} />
      <PageContainer className="pb-8">
        <SectionTitle>{strings.settings.profile}</SectionTitle>
        <PaperCard variant="paper" padding="md">
          {/* Profile stays one compact horizontal row, including on narrow
              phones, so Settings owns identity without turning it into a hero. */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Avatar
              name={profile?.displayName}
              marker={profileAvatarMarker(profile)}
              size="md"
              className="ring-1 ring-paper/70 shadow-[0_6px_18px_rgb(18_33_27_/_0.1)]"
            />
            <div className="min-w-0 flex-1">
              {editingName ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveName();
                  }}
                >
                  <label
                    htmlFor="display-name"
                    className="mb-1.5 block text-[0.8125rem] text-ash"
                  >
                    {strings.settings.displayName}
                  </label>
                  <input
                    id="display-name"
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditingName(false);
                    }}
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
                      {strings.common.save}
                    </GentleButton>
                    <GentleButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setEditingName(false)}
                    >
                      {strings.common.cancel}
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
                      {strings.common.edit}
                    </GentleButton>
                  </div>
                  {profileAvatarMarker(profile) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <GentleButton
                        variant="text"
                        size="sm"
                        className="min-h-11"
                        disabled={photoBusy}
                        onClick={() => void removePhoto()}
                      >
                        {strings.settings.removePhoto}
                      </GentleButton>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </PaperCard>

        <DisclosureGroup className="mt-6">
          <section id="appearance" className="scroll-mt-6">
            <Disclosure
              variant="card"
              className="overflow-hidden"
              label={strings.settings.appearance}
              summary={
                <span className="text-[0.8125rem] text-ash">
                  {appearanceSummary}
                </span>
              }
              open={appearanceOpen}
              onOpenChange={setAppearanceOpen}
            >
              <div className="divide-y divide-mist/70">
                <Row label="Glass surfaces">
                  <Toggle
                    label="Glass surfaces"
                    on={appearance.glassSurfaces}
                    onChange={(glassSurfaces) => setAppearance({ glassSurfaces })}
                  />
                </Row>
                <GlassOpacitySlider
                  key={appearance.glassOpacity}
                  value={appearance.glassOpacity}
                  glassEnabled={appearance.glassSurfaces}
                  onPreview={(glassOpacity) =>
                    applyAppearance({ ...appearance, glassOpacity })
                  }
                  onCommit={(glassOpacity) => setAppearance({ glassOpacity })}
                />
                <ThemePicker
                  label={strings.settings.theme}
                  systemLabel={strings.settings.themeSystem}
                  names={themeNames}
                  value={appearance.theme}
                  onChange={(theme) => setAppearance({ theme })}
                />
                <Row label={strings.settings.textSize}>
                  <Segmented
                    label={strings.settings.textSize}
                    value={appearance.textSize}
                    onChange={(textSize) => setAppearance({ textSize })}
                    options={[
                      {
                        value: "default",
                        label: strings.settings.textSizeDefault,
                      },
                      { value: "large", label: strings.settings.textSizeLarge },
                    ]}
                  />
                </Row>
                <Row label={strings.settings.boldText}>
                  <Toggle
                    label={strings.settings.boldText}
                    on={appearance.boldText}
                    onChange={(boldText) => setAppearance({ boldText })}
                  />
                </Row>
                <p className="py-3.5 text-caption leading-relaxed text-ash">
                  BibleQuest also follows iOS text size and Bold Text. Large
                  adds an extra reading boost on top of your device choice.
                </p>
                <Row label={strings.settings.reduceMotion}>
                  <Toggle
                    label={strings.settings.reduceMotion}
                    on={appearance.reducedMotion}
                    onChange={(reducedMotion) => setAppearance({ reducedMotion })}
                  />
                </Row>
              </div>
            </Disclosure>
          </section>

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

          {GREEN_FEATURES.rhythmBuilder && (
            <Disclosure
              variant="card"
              label="My rhythm"
              summary={
                <span className="text-[0.8125rem] text-ash">
                  One gentle plan · never a score
                </span>
              }
            >
              <p className="text-[0.9375rem] leading-relaxed text-charcoal">
                Choose a few ways to return during the week. Missing a day
                changes nothing.
              </p>
              <Link
                href="/app/rhythm"
                className="mt-3 inline-flex min-h-11 items-center gap-1 text-small font-medium text-accent"
              >
                Open Rhythm Builder <IconChevronRight size={15} />
              </Link>
            </Disclosure>
          )}

          <Disclosure
            variant="card"
            label={
              <span className="inline-flex items-center gap-2">
                {strings.settings.language}
                <span className="rounded-full bg-accent-surface px-2 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-accent">
                  Beta
                </span>
              </span>
            }
            summary={
              <span className="text-[0.8125rem] text-ash">
                {languageMeta(language).endonym}
              </span>
            }
          >
            <p className="pb-1 text-[0.875rem] leading-relaxed text-ash">
              {strings.settings.languageNote}
            </p>
            <LanguagePicker
              value={language}
              onChange={(code) => updateSettings({ language: code })}
            />
          </Disclosure>

          <Disclosure variant="card" label={strings.settings.reminders}>
            <NativeReminderSettings />
          </Disclosure>

          <Disclosure variant="card" label="Privacy & data">
            <p className="text-[0.9375rem] leading-relaxed text-charcoal">
              Your prayers and reflections are private by default. On this
              device they’re stored only for you. Analytics are disabled in
              this iOS release.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <GentleButton variant="outline" size="sm" onClick={exportData}>
                {strings.settings.exportData}
              </GentleButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
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
                {strings.settings.importData}
              </GentleButton>
              <Link
                href={buildPublicHref("/privacy")}
                className="inline-flex min-h-11 items-center px-1 text-[0.875rem] text-accent hover:text-accent/80"
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
                  This replaces everything on this device with the data in that
                  file. Consider exporting first — it can’t be undone.
                </p>
                <div className="mt-3 flex gap-2.5">
                  <GentleButton
                    variant="danger"
                    size="sm"
                    onClick={() => void confirmImport()}
                  >
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
                <Link
                  href={buildPublicHref("/about")}
                  className="block py-3 text-charcoal hover:text-accent"
                >
                  About BibleQuest
                </Link>
              </li>
              <li>
                <Link
                  href={buildPublicHref("/terms")}
                  className="block py-3 text-charcoal hover:text-accent"
                >
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link
                  href={buildPublicHref("/privacy")}
                  className="block py-3 text-charcoal hover:text-accent"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                {/* Keeps redistributed font notices reachable from the app. */}
                <Link
                  href={buildPublicHref("/THIRD_PARTY_NOTICES.txt")}
                  className="block py-3 text-charcoal hover:text-accent"
                >
                  Third-party notices
                </Link>
              </li>
              <li>
                <a
                  href={SUPPORT_EMAIL_HREF}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 text-charcoal hover:text-accent"
                >
                  <span>Email support</span>
                  <span className="text-caption text-ash">{SUPPORT_EMAIL}</span>
                </a>
              </li>
            </ul>
          </Disclosure>
        </DisclosureGroup>

        <SectionTitle>Start over</SectionTitle>
        <PaperCard variant="paper" padding="md">
          {!confirmClear ? (
            <>
              <p className="text-[0.875rem] leading-relaxed text-ash">
                This deletes everything on this device — prayers, reflections,
                and your journey. It can’t be undone.
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
                  disabled={clearingData}
                  onClick={() => void clearJourneyData()}
                >
                  {clearingData ? "Clearing…" : "Yes, clear everything"}
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

/** Delays local storage reads until the browser side is ready. */
export function SettingsScreen() {
  return (
    <ClientOnly>
      <SettingsInner />
    </ClientOnly>
  );
}
