import { seedQuests } from "@/data/seed/quests";
import { parseQuestGenerationInput } from "@/lib/ai/contracts";
import {
  recordAiFailure,
  selectReviewedQuestWithHaiku,
} from "@/lib/ai/anthropic.server";
import { requireServerPlus } from "@/lib/billing/plus-entitlement.server";
import { guardIdentifiedRequest } from "@/lib/bible/provider-request-guard";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import { reviewedQuestCandidates } from "@/lib/quest-generation/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_POLICIES = [
  { limit: 4, windowMs: 60_000 },
  { limit: 24, windowMs: 24 * 60 * 60_000 },
] as const;

/** Matches Plus preferences to reviewed content without exposing the API key. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const entitlement = await requireServerPlus();
  if (entitlement instanceof Response) return entitlement;
  const blocked = guardIdentifiedRequest(
    request,
    `ai-quest:${entitlement.userId}`,
    RATE_POLICIES,
  );
  if (blocked) return blocked;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return privateError("invalid_request", 400);
  }
  const parsed = parseQuestGenerationInput(input);
  if (!parsed) return privateError("invalid_request", 400);
  const { candidates, relaxed } = reviewedQuestCandidates(
    seedQuests,
    parsed,
    10,
  );
  try {
    const selected = await selectReviewedQuestWithHaiku(parsed, candidates);
    const quest = candidates.find((item) => item.slug === selected.slug);
    if (!quest) return privateError("unavailable", 503);
    return Response.json(
      {
        quest,
        source: "external_provider",
        provider: "anthropic-haiku-4.5",
        reason: selected.reason,
        notice: relaxed
          ? "Haiku used the closest available match from BibleQuest’s human-reviewed catalog."
          : "Haiku matched your choices to a human-reviewed BibleQuest quest.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    recordAiFailure("quest", error);
    return privateError("provider_unavailable", 503);
  }
}
