import { reflectionPrompts } from "@/data/seed/reflection-prompts";

export type ReflectionPrompt = (typeof reflectionPrompts)[number];

export interface ReflectionPromptSelection {
  promptPool: ReflectionPrompt[];
  requestedPrompt?: ReflectionPrompt;
}

/**
 * Honors an exact reviewed prompt before offering context-based alternatives.
 * A Scripture reference narrows only the fallback pool, never the requested id.
 */
export function selectReflectionPrompts(
  verseReference?: string,
  requestedId?: string,
): ReflectionPromptSelection {
  const requestedPrompt = requestedId
    ? reflectionPrompts.find((prompt) => prompt.id === requestedId)
    : undefined;
  const contextual = verseReference
    ? reflectionPrompts.filter(
        (prompt) => prompt.context === "after_scripture",
      )
    : reflectionPrompts;
  const fallbackPool = contextual.length ? contextual : reflectionPrompts;
  const promptPool = requestedPrompt
    ? [
        requestedPrompt,
        ...fallbackPool.filter(
          (prompt) => prompt.id !== requestedPrompt.id,
        ),
      ]
    : [...fallbackPool];
  return { promptPool, requestedPrompt };
}
