import {
  immediateSafetyAnswer,
  isImmediateSafetyQuestion,
  parseMyShepherdRequest,
} from "@/lib/ai/contracts";
import {
  answerWithMyShepherd,
  recordAiFailure,
} from "@/lib/ai/anthropic.server";
import { requireServerPlus } from "@/lib/billing/plus-entitlement.server";
import { guardProviderRequest } from "@/lib/bible/provider-request-guard";
import { hasSameOrigin, privateError } from "@/lib/http/request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_POLICIES = [
  { limit: 3, windowMs: 60_000 },
  { limit: 16, windowMs: 24 * 60 * 60_000 },
] as const;

/** Returns one bounded study answer and keeps all conversation history off-server. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const entitlement = await requireServerPlus();
  if (entitlement instanceof Response) return entitlement;
  const blocked = guardProviderRequest(
    request,
    `ai-shepherd:${entitlement.userId}`,
    RATE_POLICIES,
  );
  if (blocked) return blocked;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return privateError("invalid_request", 400);
  }
  const parsed = parseMyShepherdRequest(input);
  if (!parsed) return privateError("invalid_request", 400);
  if (isImmediateSafetyQuestion(parsed.question)) {
    return Response.json(immediateSafetyAnswer(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    return Response.json(
      await answerWithMyShepherd(parsed.question, parsed.currentPath),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    recordAiFailure("shepherd", error);
    return privateError("provider_unavailable", 503);
  }
}
