/**
 * UI-chrome translation surface.
 *
 * v1 scope, on purpose: navigation, common actions, the daily quest loop,
 * settings — the strings a non-English speaker hits constantly. Scripture
 * (WEB), quest content, prayers, and long-form copy remain English for
 * now; the language note in Settings says so plainly.
 *
 * Every locale file implements this interface completely — the type system
 * is the completeness check. English (en.ts) is the source of truth.
 */
export interface UIStrings {
  meta: {
    /** BCP-47-ish code stored in settings.language. */
    code: string;
    /** The language's own name — what the picker shows. */
    endonym: string;
    /** English name, shown small next to the endonym. */
    english: string;
    dir: "ltr" | "rtl";
  };
  nav: {
    home: string;
    quests: string;
    bible: string;
    prayer: string;
    journey: string;
  };
  titles: {
    settings: string;
    account: string;
    reflections: string;
    savedVerses: string;
  };
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    close: string;
    back: string;
    done: string;
    add: string;
    remove: string;
    undo: string;
    retry: string;
    loading: string;
  };
  greeting: {
    morning: string;
    afternoon: string;
    evening: string;
    night: string;
  };
  home: {
    todaysVerse: string;
    todaysQuests: string;
    yourGrowth: string;
    recently: string;
    quickPrayer: string;
    openSettings: string;
    /** The gentle verse-refresh control. */
    anotherVerse: string;
    /** Share button on the verse card (native share sheet / copy fallback). */
    share: string;
    /** Toast after the clipboard fallback copies the verse. */
    shareCopied: string;
    /** Toast when the clipboard fallback fails. */
    shareCopyFailed: string;
    /** Subtitle on the Reflection quick-row. */
    reflectionHint: string;
  };
  /** The candle — gentle daily-rhythm streak. Never shame, never loss. */
  streak: {
    title: string;
    /** Uses {n}, e.g. "Day {n}". */
    day: string;
    lit: string;
    unlit: string;
    keepGoing: string;
  };
  journey: {
    /** Uses {n}: steps remaining to the next tree stage. */
    toNext: string;
    /** Singular companion to toNext — full sentence, no {n}. */
    toNextOne: string;
    /** Shown at the final stage instead of a countdown. */
    fullGrown: string;
    sanctuary: string;
    sanctuarySoon: string;
  };
  quests: {
    emptyTitle: string;
    emptyBody: string;
    pickCta: string;
    addAnother: string;
    filters: string;
    search: string;
    duration: string;
    category: string;
    energy: string;
    soloOrSocial: string;
    indoorOrOutdoor: string;
    today: string;
    suggested: string;
    /** Uses {n} placeholder, e.g. "{n} of 3 picked". */
    picked: string;
    capReached: string;
    added: string;
    removed: string;
    addToToday: string;
    begin: string;
    completedToday: string;
  };
  dayComplete: {
    title: string;
    body: string;
  };
  /** My Quests — the persistent quest shelf and its Home feed. */
  myQuests: {
    /** Feed section heading on Home. */
    title: string;
    /** Sub-section: active walks beyond today's picks. */
    continueTitle: string;
    /** Sub-section: saved-for-later and paused quests. */
    savedTitle: string;
    /** Collapsed sub-section: finished walks. */
    completedTitle: string;
    /** Collapsed sub-section inside completed: archived quests. */
    archivedTitle: string;
    emptyTitle: string;
    emptyBody: string;
    browseCta: string;
    continueCta: string;
    resumeCta: string;
    /** Reopen a completed quest. */
    reopenCta: string;
    saveForLater: string;
    savedToast: string;
    pause: string;
    pausedToast: string;
    archive: string;
    archivedToast: string;
    /** Remove from the shelf (the quest stays in Browse). */
    removeFromShelf: string;
    removedToast: string;
    statusNew: string;
    statusInProgress: string;
    statusSaved: string;
    statusPaused: string;
    statusCompleted: string;
    statusArchived: string;
    /** Chip on quests picked for today. */
    statusToday: string;
    /** Uses {done} and {total}, e.g. "2 of 4 steps". */
    steps: string;
    /** Uses {step}, e.g. "Next: Read the Scripture". */
    nextStep: string;
    stepScripture: string;
    stepLive: string;
    stepReflect: string;
    stepPray: string;
    /** Uses {n} — lifetime completions of one quest, shown when > 1. */
    walkedTimes: string;
    /** aria-label prefix for the card toggle; uses {title}. */
    toggleDetails: string;
  };
  /** Gentle, contextual invitation to create an account. */
  accountPrompt: {
    title: string;
    body: string;
    cta: string;
    dismiss: string;
  };
  empty: {
    prayer: string;
    reflections: string;
    journey: string;
    bookmarks: string;
    questsFiltered: string;
    questsUnpicked: string;
  };
  errors: {
    general: string;
    save: string;
    offline: string;
  };
  settings: {
    language: string;
    languageNote: string;
    appearance: string;
    theme: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    textSize: string;
    textSizeDefault: string;
    textSizeLarge: string;
    boldText: string;
    reduceMotion: string;
    reminders: string;
    profile: string;
    displayName: string;
    changePhoto: string;
    removePhoto: string;
    /** Toast after the profile photo saves. */
    photoSaved: string;
    /** Toast when the profile photo can’t be saved. */
    photoError: string;
    data: string;
    exportData: string;
    importData: string;
    clearAll: string;
    account: string;
    signIn: string;
    signOut: string;
    privacy: string;
    /** The anonymous-usage analytics toggle. */
    analyticsToggle: string;
    analyticsNote: string;
  };
}
