# Quest generation

BibleQuest Plus sends bounded preference fields—focus, category, duration, and
variation—to the server-only `/api/ai/quest` route. The route verifies same
origin, confirms the signed-in user’s Plus entitlement, rate-limits requests,
and gives Claude Haiku 4.5 a shortlist from the 150 human-reviewed, locally
bundled quests. Structured output can select only an allowed quest slug.

Prayer, reflection, profile, journal, and other free-form spiritual text never
enter this flow. The Anthropic key remains server-only, responses are private
and uncached, and Haiku cannot invent a quest or alter reviewed quest content.

If the server provider is unavailable, `ReviewedCatalogQuestProvider` selects
from the same reviewed catalog on-device. This fallback preserves a useful
result without hiding that Haiku was unavailable.

The provider-neutral request and fallback contract live in
`src/lib/quest-generation/provider.ts`. The server adapter and its entitlement,
rate, origin, and structured-output boundaries live in
`src/app/api/ai/quest/route.ts` and `src/lib/ai/anthropic.server.ts`.
