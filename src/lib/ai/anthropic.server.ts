import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import {
  MY_SHEPHERD_DESTINATIONS,
  type MyShepherdAnswer,
} from "./contracts";
import {
  MY_SHEPHERD_SYSTEM_PROMPT,
  myShepherdPrompt,
  questMatchPrompt,
} from "./prompts";
import type { QuestGenerationRequest } from "@/lib/quest-generation/provider";
import type { QuestTemplate } from "@/lib/questos/types";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
let client: Anthropic | null = null;

/** Keeps the API key and pinned model available only in the Node server runtime. */
function anthropicConfiguration() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  if (!apiKey || apiKey.length < 20) {
    throw new Error("Anthropic configuration unavailable.");
  }
  if (model !== DEFAULT_MODEL) {
    throw new Error("Anthropic model is not approved for BibleQuest.");
  }
  return { apiKey, model };
}

/** Reuses one bounded server client; browser construction remains disabled. */
function anthropicClient(): { client: Anthropic; model: string } {
  const configuration = anthropicConfiguration();
  client ??= new Anthropic({
    apiKey: configuration.apiKey,
    maxRetries: 1,
    timeout: 20_000,
  });
  return { client, model: configuration.model };
}

/** Uses structured output to select only an allowed, reviewed quest slug. */
export async function selectReviewedQuestWithHaiku(
  request: QuestGenerationRequest,
  candidates: readonly QuestTemplate[],
): Promise<{ slug: string; reason: string }> {
  if (candidates.length === 0) throw new Error("No quest candidates.");
  const { client: anthropic, model } = anthropicClient();
  const format = jsonSchemaOutputFormat({
    type: "object",
    properties: {
      selectedSlug: {
        type: "string",
        enum: candidates.map((quest) => quest.slug),
      },
      reason: { type: "string", minLength: 1, maxLength: 180 },
    },
    required: ["selectedSlug", "reason"],
    additionalProperties: false,
  });
  const message = await anthropic.messages.parse({
    model,
    max_tokens: 120,
    system:
      "You match a person's non-sensitive preferences to a closed list of human-reviewed Christian formation quests. Never invent content or claim divine direction.",
    messages: [
      { role: "user", content: questMatchPrompt(request, candidates) },
    ],
    output_config: { format },
  });
  const parsed = message.parsed_output as
    | { selectedSlug?: unknown; reason?: unknown }
    | null;
  const selected = candidates.find(
    (quest) => quest.slug === parsed?.selectedSlug,
  );
  if (!selected || typeof parsed?.reason !== "string") {
    throw new Error("Anthropic quest response was invalid.");
  }
  return {
    slug: selected.slug,
    reason: parsed.reason.trim().slice(0, 180),
  };
}

/** Produces one non-persistent, structured study response within hard limits. */
export async function answerWithMyShepherd(
  question: string,
  currentPath: string | null = null,
): Promise<MyShepherdAnswer> {
  const { client: anthropic, model } = anthropicClient();
  const format = jsonSchemaOutputFormat({
    type: "object",
    properties: {
      answer: { type: "string", minLength: 1, maxLength: 1800 },
      scriptureReferences: {
        type: "array",
        items: { type: "string", minLength: 3, maxLength: 80 },
        maxItems: 4,
      },
      nextStep: { type: "string", minLength: 1, maxLength: 240 },
      safetyNote: {
        anyOf: [
          { type: "string", minLength: 1, maxLength: 300 },
          { type: "null" },
        ],
      },
      appAction: {
        anyOf: [
          {
            type: "object",
            properties: {
              destination: {
                type: "string",
                enum: [...MY_SHEPHERD_DESTINATIONS],
              },
              label: { type: "string", minLength: 1, maxLength: 60 },
            },
            required: ["destination", "label"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
    },
    required: [
      "answer",
      "scriptureReferences",
      "nextStep",
      "safetyNote",
      "appAction",
    ],
    additionalProperties: false,
  });
  const message = await anthropic.messages.parse({
    model,
    max_tokens: 650,
    system: MY_SHEPHERD_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: myShepherdPrompt(question, currentPath) },
    ],
    output_config: { format },
  });
  const parsed = message.parsed_output as MyShepherdAnswer | null;
  if (
    !parsed ||
    typeof parsed.answer !== "string" ||
    !Array.isArray(parsed.scriptureReferences) ||
    typeof parsed.nextStep !== "string" ||
    (parsed.safetyNote !== null && typeof parsed.safetyNote !== "string") ||
    (parsed.appAction !== null &&
      (!MY_SHEPHERD_DESTINATIONS.includes(
        parsed.appAction.destination,
      ) ||
        typeof parsed.appAction.label !== "string"))
  ) {
    throw new Error("Anthropic guide response was invalid.");
  }
  return {
    answer: parsed.answer.trim().slice(0, 1800),
    scriptureReferences: parsed.scriptureReferences
      .filter((reference) => typeof reference === "string")
      .map((reference) => reference.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 4),
    nextStep: parsed.nextStep.trim().slice(0, 240),
    safetyNote: parsed.safetyNote?.trim().slice(0, 300) || null,
    appAction: parsed.appAction
      ? {
          destination: parsed.appAction.destination,
          label: parsed.appAction.label.trim().slice(0, 60),
        }
      : null,
  };
}
