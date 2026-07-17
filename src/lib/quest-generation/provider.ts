/**
 * Provider-neutral quest-generation contract.
 *
 * Launch behavior uses the reviewed local catalog, so no journal, prayer, or
 * profile text leaves the device and generated recommendations are always
 * human-reviewed. A future server adapter may implement the same contract for
 * OpenAI, Anthropic, or another provider after entitlement and safety review.
 */
import type {
  EnergyLevel,
  QuestCategory,
  QuestDuration,
  QuestTemplate,
  SoloOrSocial,
  IndoorOrOutdoor,
} from "@/lib/questos/types";
import { hashString } from "@/lib/utils/dates";

export const QUEST_GENERATION_FOCUSES = [
  "prayer",
  "scripture",
  "relationships",
  "service",
  "rest",
  "justice",
  "discernment",
] as const;
export type QuestGenerationFocus = (typeof QUEST_GENERATION_FOCUSES)[number];

/** Deliberately structured: never accepts private free-form spiritual text. */
export interface QuestGenerationRequest {
  category?: QuestCategory;
  duration?: QuestDuration;
  energy?: EnergyLevel;
  company?: SoloOrSocial;
  setting?: IndoorOrOutdoor;
  focus?: QuestGenerationFocus;
  /** Caller-controlled variation without personal data. */
  variation: number;
}

export interface QuestGenerationResult {
  quest: QuestTemplate;
  source: "reviewed_catalog" | "external_provider";
  provider: string;
  notice: string;
}

export interface QuestGenerationProvider {
  readonly id: string;
  readonly sendsDataOffDevice: boolean;
  generate(request: QuestGenerationRequest): Promise<QuestGenerationResult>;
}

const FOCUS_TERMS: Record<QuestGenerationFocus, string[]> = {
  prayer: ["prayer", "intercession", "lament", "worship"],
  scripture: ["scripture", "gospel", "psalm", "study", "memory"],
  relationships: ["relationship", "family", "community", "listening", "repair"],
  service: ["service", "volunteering", "care", "work"],
  rest: ["rest", "sabbath", "silence", "quiet", "retreat"],
  justice: ["justice", "advocacy", "solidarity", "dignity"],
  discernment: ["discernment", "wisdom", "decision", "reflection"],
};

function matches(quest: QuestTemplate, request: QuestGenerationRequest): boolean {
  if (request.category && quest.category !== request.category) return false;
  if (request.duration && quest.durationMinutes !== request.duration) return false;
  if (request.energy && quest.energyLevel !== request.energy) return false;
  if (
    request.company &&
    request.company !== "either" &&
    quest.soloOrSocial !== "either" &&
    quest.soloOrSocial !== request.company
  ) return false;
  if (
    request.setting &&
    request.setting !== "either" &&
    quest.indoorOrOutdoor !== "either" &&
    quest.indoorOrOutdoor !== request.setting
  ) return false;
  if (request.focus) {
    const haystack = `${quest.title} ${quest.category} ${quest.tags.join(" ")}`.toLowerCase();
    if (!FOCUS_TERMS[request.focus].some((term) => haystack.includes(term))) {
      return false;
    }
  }
  return true;
}

/**
 * Safe launch provider: composes a recommendation from the 150 reviewed,
 * locally bundled quests. Strict filters are relaxed one layer at a time so
 * the button always returns an honest option instead of inventing content.
 */
export class ReviewedCatalogQuestProvider implements QuestGenerationProvider {
  readonly id = "reviewed-catalog-v1";
  readonly sendsDataOffDevice = false;

  constructor(private readonly catalog: readonly QuestTemplate[]) {}

  async generate(request: QuestGenerationRequest): Promise<QuestGenerationResult> {
    const freeCatalog = this.catalog.filter((quest) => !quest.isPremium);
    if (!freeCatalog.length) {
      throw new Error("The reviewed quest catalog is empty.");
    }

    let candidates = freeCatalog.filter((quest) => matches(quest, request));
    let relaxed = false;
    if (!candidates.length && request.focus) {
      candidates = freeCatalog.filter((quest) =>
        matches(quest, { ...request, focus: undefined })
      );
      relaxed = true;
    }
    if (!candidates.length && request.duration) {
      candidates = freeCatalog.filter((quest) =>
        matches(quest, { ...request, focus: undefined, duration: undefined })
      );
      relaxed = true;
    }
    if (!candidates.length) {
      candidates = freeCatalog;
      relaxed = true;
    }

    const { variation, ...preferences } = request;
    const step = Number.isFinite(variation)
      ? Math.max(0, Math.trunc(variation))
      : 0;
    const index =
      (hashString(JSON.stringify(preferences)) + step) % candidates.length;
    return {
      quest: candidates[index],
      source: "reviewed_catalog",
      provider: this.id,
      notice: relaxed
        ? "No exact match was available, so BibleQuest used the closest reviewed option on this device."
        : "Selected on this device from BibleQuest’s reviewed catalog.",
    };
  }
}

/** Future server adapters (OpenAI, Anthropic, etc.) implement this factory. */
export function createReviewedQuestProvider(
  catalog: readonly QuestTemplate[]
): QuestGenerationProvider {
  return new ReviewedCatalogQuestProvider(catalog);
}
