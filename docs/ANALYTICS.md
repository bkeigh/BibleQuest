# Analytics contract

BibleQuest uses one analytics transport: a direct `POST` to the configured
Plausible Events API. There is no Plausible page script and no
`window.plausible` dispatch path.

Collection is off by default. An event is accepted only when all three
conditions are true:

1. `NEXT_PUBLIC_ANALYTICS_ENABLED` is exactly `true` and both the Plausible
   domain and HTTPS API host are valid.
2. This browser has an explicit persisted opt-in from Settings → Privacy.
3. Do Not Track and Global Privacy Control are not enabled.

Missing, unreadable, migrated, cleared, or imported consent is treated as off.
Opt-out clears the bounded local queue, aborts in-flight requests, propagates
across tabs, and remains off in later sessions.

## Event and property allowlist

Events in the first row accept no properties. Every other event requires
exactly the listed properties; missing keys, extra keys, non-integer numbers,
and unrecognized or oversized strings reject the whole event.

| Events | Allowed properties | Classification and bounds |
| --- | --- | --- |
| `onboarding_started`, `onboarding_completed`, `quest_picked`, `quest_unpicked`, `quest_started`, `quest_saved`, `quest_paused`, `quest_resumed`, `quest_archived`, `quest_removed`, `quest_reopened`, `reflection_created`, `prayer_created`, `prayer_answered`, `bible_chapter_opened`, `verse_bookmarked`, `verse_shared`, `sign_in_completed`, `sign_out`, `pwa_install_prompt_viewed`, `pwa_install_accepted`, `pwa_install_dismissed` | none | no properties accepted |
| `quest_viewed`, `quest_completed`, `quest_card_expanded` | `category` | bounded quest-category enum |
| `quest_step_completed` | `step` | `scripture`, `live`, `reflect`, or `pray` |
| `reflection_started` | `source` | `quest` only |
| `streak_milestone` | `count` | small integer, 1–365 |
| `account_prompt_viewed`, `account_prompt_dismissed`, `account_prompt_accepted` | `context` | bounded account-prompt enum |
| `sign_in_started` | `method`, `source` | method: `magic_link`, `phone_otp`, or `google`; source: `account` or `onboarding` |
| `sync_completed` | `status` | `initial` only |
| `sync_failed` | `status` | `initial` or `push` |

All other properties are forbidden. This includes prayer, reflection, note, and
verse text; email; phone; user and record IDs; auth tokens; referrers; query
strings; hashes; and arbitrary free text.

## URL and offline behavior

The payload URL keeps only a same-origin, allowlisted static pathname. Dynamic
Bible and quest segments are replaced with route templates, unknown paths fall
back to `/`, and query strings and hashes are removed. Requests omit credentials
and use `Referrer-Policy: no-referrer`.

Failed network attempts may be retried from `localStorage`. The queue is capped
at 50 events, sanitized before every write and again before every flush, checked
for consent before each send, and removed immediately on opt-out. Analytics
storage or network failures are silent no-ops.

Sanitized example:

```json
{
  "domain": "biblequest.co",
  "name": "sign_in_started",
  "url": "https://biblequest.co/app/account",
  "props": {
    "method": "magic_link",
    "source": "account"
  }
}
```

The payload contains an event name, normalized route, and bounded enums only—no
private text or identifiers.
