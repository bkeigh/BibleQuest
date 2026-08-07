/**
 * One shared default for new devices, imported backups, and account rows.
 * Existing explicit user choices are preserved by store and database migrations.
 *
 * This is deliberately NOT target-dependent. It is written into the persisted
 * settings blob and synced to the account row, so a per-platform value would
 * travel: a reader who first opened the iOS app would silently have their web
 * preference rewritten, and the sync reconciler's baseline would differ by
 * device. Which edition a given build can actually RENDER is a resolution-time
 * question, handled by `usePreferredBibleChapter`, which falls back to the
 * bundled World English Bible and surfaces a notice when the preferred edition
 * cannot be loaded.
 */
export const DEFAULT_BIBLE_TRANSLATION_KEY = "kjv";
