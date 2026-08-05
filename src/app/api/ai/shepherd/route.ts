import {
  AI_REQUEST_MAX_BYTES,
  immediateSafetyAnswer,
  isImmediateSafetyQuestion,
  parseMyShepherdRequest,
} from "@/lib/ai/contracts";
import {
  answerWithMyShepherd,
  recordAiFailure,
} from "@/lib/ai/anthropic.server";
import { requireServerPlus } from "@/lib/billing/plus-entitlement.server";
import { guardIdentifiedRequest } from "@/lib/bible/provider-request-guard";
import { boundedJson } from "@/lib/http/json";
import { hasSameOrigin, privateError } from "@/lib/http/request";
import {
  distributedPoliciesFromWindows,
  guardDistributedRequest,
} from "@/lib/security/distributed-rate-limit.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_POLICIES = [
  { limit: 3, windowMs: 60_000 },
  { limit: 16, windowMs: 24 * 60 * 60_000 },
] as const;

/** Returns one bounded study answer and keeps all conversation history off-server. */
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return privateError("forbidden", 403);
  const entitlement = await requireServerPlus(request);
  if (entitlement instanceof Response) return entitlement;

  // Cap the raw request before parsing or reserving any paid-provider quota.
  const input = await boundedJson(request, AI_REQUEST_MAX_BYTES);
  if (input instanceof Response) return input;
  const parsed = parseMyShepherdRequest(input);
  if (!parsed) return privateError("invalid_request", 400);
  if (isImmediateSafetyQuestion(parsed.question)) {
    return Response.json(immediateSafetyAnswer(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const blocked = guardIdentifiedRequest(
    request,
    `ai-shepherd:${entitlement.userId}`,
    RATE_POLICIES,
  );
  if (blocked) return blocked;
  const distributedBlocked = await guardDistributedRequest(
    request,
    "ai-shepherd",
    distributedPoliciesFromWindows(RATE_POLICIES),
    entitlement.userId,
  );
  if (distributedBlocked) return distributedBlocked;
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
