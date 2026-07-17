# Quest generation

BibleQuest launches quest generation with `ReviewedCatalogQuestProvider`.
It selects from the 150 human-reviewed, locally bundled quests using only
structured filters. It sends no prayer, reflection, profile, or journal text
off-device and requires no model key.

The provider-neutral contract lives in
`src/lib/quest-generation/provider.ts`. A future OpenAI, Anthropic, or other
adapter should implement `QuestGenerationProvider` on the server and preserve
the structured request boundary. Before enabling an external adapter, add:

- server-side Supabase authentication and RevenueCat entitlement validation;
- schema validation for provider output plus category/scripture allowlists;
- safety and theological review, rate limits, and refusal/fallback behavior;
- explicit privacy copy and retention controls.

Until those controls exist, no external quest-generation API route is enabled.
The Plus UI remains fully usable through the reviewed local provider.
