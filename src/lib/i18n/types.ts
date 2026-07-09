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
  };
  quests: {
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
    reduceMotion: string;
    reminders: string;
    data: string;
    exportData: string;
    importData: string;
    clearAll: string;
    account: string;
    signIn: string;
    signOut: string;
  };
}
