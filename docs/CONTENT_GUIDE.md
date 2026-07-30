# Content guide

BibleQuest content must be spiritually responsible. This distills Volume VIII of
the Codex. Every quest, prayer prompt, reflection prompt, and milestone in
`src/data/seed/` was generated and then verified by three adversarial reviewers
(safety, tone, theology) before shipping.

## Voice

Warm, literary, calm, plain, humble, human. Short sentences, one idea at a time.

**Preferred:** journey, pilgrimage, step, quiet, notice, carry, begin, return,
kindness, mercy, grace, patience, gratitude.

**Never:** fail/failure, streak, crush, dominate, optimize, level up, unlock,
grind, "don't lose", "God is disappointed", "prove your faith", scores/ranks.

Ecumenical Christian default — welcoming to Catholic, Orthodox, Protestant,
non-denominational, and exploring users. Warm conviction, not vagueness. Label
tradition-specific content clearly.

## Quests

Every quest is specific, safe, doable today, free, and grounded in Scripture or
Christian practice. Structure: title · invitation (one imperative sentence) ·
why it matters · scripture reference · reflection prompt · prayer prompt.

The launch catalogue contains 150 reviewed quests across 14 categories. It
must preserve a real range of commitment: short accessible invitations remain,
but filters also need substantial Scripture study, practiced prayer, service,
repair, community participation, justice, discernment, silence, and formation.
Adding volume by paraphrasing the same surface-level action is not acceptable.

Scripture references must genuinely support the action (no proof-texting) and be
real. Short passages (≤ 4 verses) are hydrated with exact WEB text.

### Sensitive categories — hard rules

- **Forgiveness:** internal work only (prayer, unsent letters, releasing
  bitterness). Never suggest contacting, confronting, or reconciling with anyone
  who caused harm. Never imply forgiveness requires contact or trust.
- **Discipline / fasting:** only media, phone, comfort, or habits. **Never** food
  restriction or health/medical claims.
- **Generosity / money:** within your means only. Never pressure giving, never
  promise reward for giving.
- **Family / relationships:** thank, listen, serve, pray for. Never force
  reconciliation, never assume safe home situations.
- **Evangelization:** gentle, consent-aware sharing only. Never approach
  strangers or use fear.

Sensitive quests carry `sensitivityTags` and surface a calm safety note in the
UI (see `SENSITIVITY_COPY` in `QuestDetail.tsx`).

## Prayer & reflection prompts

Prayers: 1–2 sentences, first person, humble, honest, no prosperity/guilt.
Reflections: one open, gentle question — never interrogating ("Why did you
fail?" is forbidden).

## Milestones

Gentle pilgrimage markers, never competitive. Second-person, past tense, warm.
No leaderboards, no comparison, no badge fanfare.

## Never (product-wide)

Claim AI speaks for God; present AI as Scripture; use guilt for engagement;
shame missed days; encourage unsafe contact; tell users to stop treatment;
promise financial reward for giving; publicize private prayers; build holiness
leaderboards; treat subscription as spiritual superiority; use copyrighted Bible
translations without a license.

## Plus quest generation boundary

“Generate a quest” sends only bounded focus, category, duration, and variation
fields to the server. After same-origin, Plus-entitlement, and rate checks,
Claude Haiku 4.5 may select one slug from a small list of reviewed templates.
It cannot invent or rewrite quest content. No profile, prayer, reflection,
journal, or free-form spiritual text enters the request.

If Haiku is unavailable, the reviewed local matcher selects from the same
catalog on-device and clearly discloses the fallback. Copy must never describe
the whole feature as on-device while the external path is enabled. Generated
reason text must never claim to be God's voice or replace Scripture, clergy,
counseling, or emergency support.

## Regenerating content

```bash
node scripts/build-seed.mjs <seed-result.json>          # → src/data/seed/*.ts
node scripts/build-quest-expansion.mjs                  # → reviewed 66-quest expansion
node scripts/build-daily-verses.mjs                     # → 180 local WEB passages
node scripts/build-supabase-seed.mjs                    # → canonical supabase/seed.sql
```

New sensitive content should be treated as human-review-needed before launch.
