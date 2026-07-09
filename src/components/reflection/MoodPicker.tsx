"use client";

import { REFLECTION_MOODS, type ReflectionMood } from "@/lib/questos/types";
import { cn } from "@/lib/utils/cn";

const MOOD_LABEL: Record<ReflectionMood, string> = {
  grateful: "Grateful",
  peaceful: "Peaceful",
  hopeful: "Hopeful",
  tired: "Tired",
  tender: "Tender",
  unsettled: "Unsettled",
};

export function MoodPicker({
  value,
  onChange,
}: {
  value?: ReflectionMood;
  onChange: (m: ReflectionMood | undefined) => void;
}) {
  return (
    <div>
      <p id="mood-picker-label" className="mb-2 text-[0.8125rem] text-ash">
        How are you, honestly?
      </p>
      <div
        role="group"
        aria-labelledby="mood-picker-label"
        className="flex flex-wrap gap-2"
      >
        {REFLECTION_MOODS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={value === m}
            onClick={() => onChange(value === m ? undefined : m)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[0.8125rem] transition-all duration-300",
              value === m
                ? "border-accent bg-accent-surface text-accent"
                : "border-mist bg-paper text-ash hover:border-accent/50"
            )}
          >
            {MOOD_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
