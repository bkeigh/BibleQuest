# QA checklist

## Automated

```bash
pnpm lint       # ESLint — 0 errors
npx tsc --noEmit # TypeScript — 0 errors
pnpm build      # production build succeeds
```

## Manual — core daily loop

- [ ] A new visitor to `/app` is routed to onboarding.
- [ ] Onboarding completes in under two minutes; optional steps are skippable.
- [ ] Home shows greeting, today's verse, today's quest, quick prayer, tree
      preview, continue reading, recent activity.
- [ ] "Something else?" rerolls the daily quest without shame language.
- [ ] Quest detail shows scripture text, why-it-matters, prayer-to-begin, and a
      safety note for sensitive quests.
- [ ] Begin → reflect → complete works; reflection is optional.
- [ ] Completion updates the journey timeline and grows the tree.
- [ ] Milestones reveal gently, one at a time, and never repeat.

## Manual — sections

- [ ] Prayer: create, mark answered (with note), archive. Content feels private.
- [ ] Reflection: create standalone and from a verse; appears in the list.
- [ ] Bible: open a book → chapter; verses render in serif with real WEB text;
      bookmark a verse; "Continue reading" returns to it.
- [ ] Journey: tree stage + growth breakdown + markers + timeline all correct.
- [ ] Settings: theme (incl. Candle/dark), text size, reduced motion apply live;
      export downloads JSON; clear-data returns to onboarding.
- [ ] Plus: free promise shown first; nothing spiritual is gated.

## Manual — PWA & platform

- [ ] Add to Home Screen on iPhone Safari; opens standalone.
- [ ] Offline fallback appears when disconnected.
- [ ] Mobile (375px) and desktop layouts both read well; bottom nav respects
      safe areas.
- [ ] Reduced-motion preference (OS or in-app) stills the ambient animation.

## Manual — guardrails

- [ ] No shame / streak-loss / guilt copy anywhere.
- [ ] No prayer or reflection text appears in console, network analytics, or logs.
- [ ] Scripture is labeled "World English Bible".
- [ ] Nothing implies paid users are closer to God.
- [ ] The UI never looks like a generic Tailwind/shadcn dashboard.

## Known gaps (documented, not bugs)

- Account sync / notifications / payments / AI Guide are scaffolds.
- Data is device-local until account sync is enabled.
