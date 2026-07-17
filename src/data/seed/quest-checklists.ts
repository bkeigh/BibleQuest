/**
 * Hand-reviewed checklists for quests whose invitations contain several
 * concrete movements. Keeping this layer separate lets both generated quest
 * catalogs be rebuilt without erasing editorial checklist work.
 *
 * Keys are stable progress identifiers from the existing quest-walk model;
 * labels may be refined later without invalidating a person's saved progress.
 */
import type {
  QuestChecklistItem,
  QuestTemplate,
} from "@/lib/questos/types";

export const questChecklists = {
  "pray-for-three-people-by-name": [
    {
      key: "scripture",
      label: "Choose three people and hold each name clearly before God.",
    },
    {
      key: "live",
      label: "Pray one specific, compassionate request for the first person.",
    },
    {
      key: "reflect",
      label: "Pray one specific, compassionate request for the second person.",
    },
    {
      key: "pray",
      label: "Pray one specific, compassionate request for the third person.",
    },
  ],
  "the-lords-prayer-slowly": [
    {
      key: "scripture",
      label: "Read Matthew 6:9–13 once without rushing.",
    },
    {
      key: "live",
      label: "Pause after each line and notice what it asks of you.",
    },
    {
      key: "pray",
      label: "Pray the whole prayer slowly in your own voice.",
    },
  ],
  "one-hour-given": [
    {
      key: "live",
      label: "Choose one useful act of service that the other person welcomes.",
    },
    {
      key: "reflect",
      label: "Give the full hour without rushing or seeking recognition.",
    },
  ],
  "thanks-after-a-hard-season": [
    {
      key: "live",
      label: "Write a few honest lines about the hard season.",
    },
    {
      key: "reflect",
      label: "Name one small mercy—or honestly name that none is visible yet.",
    },
    {
      key: "pray",
      label: "Offer what you wrote to God without polishing it.",
    },
  ],

  // Reviewed expansion quests ------------------------------------------------
  "pray-the-examen-before-sleep": [
    {
      key: "scripture",
      label: "Become still and receive the day as a gift from God.",
    },
    {
      key: "live",
      label: "Review where love, gratitude, or life became visible.",
    },
    {
      key: "reflect",
      label: "Name where love grew thin without turning to self-accusation.",
    },
    {
      key: "pray",
      label: "Entrust tomorrow to God without trying to solve it tonight.",
    },
  ],
  "compare-two-resurrection-accounts": [
    {
      key: "scripture",
      label: "Read Matthew 28 and John 20 side by side.",
    },
    {
      key: "live",
      label: "List what each Gospel emphasizes and what questions remain.",
    },
    {
      key: "reflect",
      label: "Write what both accounts proclaim before opening a study note.",
    },
  ],
  "serve-a-local-need-with-consent": [
    {
      key: "scripture",
      label: "Confirm the organization and shift are established and safe.",
    },
    {
      key: "live",
      label: "Ask the local leaders which work is actually useful.",
    },
    {
      key: "reflect",
      label: "Complete the assigned task according to their direction.",
    },
  ],
  "make-a-practical-help-plan": [
    {
      key: "live",
      label: "Ask what kind of help would genuinely reduce the burden.",
    },
    {
      key: "reflect",
      label: "Agree on one specific task, time, and healthy boundary.",
    },
    {
      key: "pray",
      label: "Set a clear follow-up so the offer becomes reliable help.",
    },
  ],
  "commit-to-a-month-of-service": [
    {
      key: "scripture",
      label: "Research one trusted, community-led effort.",
    },
    {
      key: "live",
      label: "Contact its coordinator and learn what commitment is useful.",
    },
    {
      key: "reflect",
      label: "Put four realistic service dates on your calendar.",
    },
    {
      key: "pray",
      label: "Complete the first shift or required orientation.",
    },
  ],
  "write-a-sabbath-plan": [
    {
      key: "scripture",
      label: "Choose a realistic beginning and ending time for Sabbath.",
    },
    {
      key: "live",
      label: "Write what you will stop and what restores worship and delight.",
    },
    {
      key: "reflect",
      label: "Tell anyone who needs notice and account for their needs.",
    },
    {
      key: "pray",
      label: "Prepare what you can so your rest does not burden someone else.",
    },
  ],
  "keep-three-hours-of-prayer": [
    {
      key: "scripture",
      label: "Set realistic times for morning, midday, and evening prayer.",
    },
    {
      key: "live",
      label: "Keep the morning pause with a Psalm, prayer, and intercession.",
    },
    {
      key: "reflect",
      label: "Return for the midday pause, even if the timing is imperfect.",
    },
    {
      key: "pray",
      label: "Close the day with the evening pause.",
    },
  ],
  "create-a-home-liturgy": [
    {
      key: "scripture",
      label: "Choose a Psalm and one short Scripture reading.",
    },
    {
      key: "live",
      label: "Write gathering, confession, intercession, and gratitude words.",
    },
    {
      key: "pray",
      label: "Add a closing blessing and pray the liturgy once.",
    },
  ],
  "record-a-family-faith-story": [
    {
      key: "live",
      label: "Invite a relative or chosen-family elder without pressure.",
    },
    {
      key: "reflect",
      label: "Listen to one story without correcting or polishing their memory.",
    },
    {
      key: "pray",
      label: "Ask permission before recording, saving, or sharing the story.",
    },
  ],
  "plan-a-household-service-day": [
    {
      key: "scripture",
      label: "Choose a need defined by the community you hope to serve.",
    },
    {
      key: "live",
      label: "Give each household member a meaningful, age-appropriate role.",
    },
    {
      key: "reflect",
      label: "Prepare for transportation, supplies, and access needs.",
    },
    {
      key: "pray",
      label: "Plan a closing reflection centered on what your household learned.",
    },
  ],
  "attend-a-community-meeting": [
    {
      key: "scripture",
      label: "Choose a real meeting and review its agenda beforehand.",
    },
    {
      key: "live",
      label: "Attend and listen before deciding whether to speak.",
    },
    {
      key: "reflect",
      label: "Note whose experience shaped the room and who was missing.",
    },
    {
      key: "pray",
      label: "Choose one responsible follow-up within your role.",
    },
  ],
  "draft-a-rule-of-life": [
    {
      key: "scripture",
      label: "Name the real season, limits, and responsibilities shaping you.",
    },
    {
      key: "live",
      label: "Draft small rhythms for prayer, body, work, relationships, rest, money, and service.",
    },
    {
      key: "reflect",
      label: "Choose a review date and remove practices your season cannot hold.",
    },
  ],
  "discern-a-decision-with-counsel": [
    {
      key: "scripture",
      label: "Write the known facts, obligations, and people affected.",
    },
    {
      key: "live",
      label: "Name your desires and fears without calling either God's answer.",
    },
    {
      key: "reflect",
      label: "Identify missing information and one trustworthy counselor.",
    },
    {
      key: "pray",
      label: "Set a next step that leaves room for counsel and correction.",
    },
  ],
  "write-a-patient-hope-plan": [
    {
      key: "scripture",
      label: "Name the hope and separate what you can control from what you cannot.",
    },
    {
      key: "live",
      label: "Write one faithful action and the support it will require.",
    },
    {
      key: "reflect",
      label: "Choose a review date rather than checking the outcome constantly.",
    },
    {
      key: "pray",
      label: "Name how you will live meaningfully while you wait.",
    },
  ],
} satisfies Record<string, QuestChecklistItem[]>;

/** Add a curated checklist without mutating the generated quest template. */
export function withQuestChecklist(quest: QuestTemplate): QuestTemplate {
  const checklist = questChecklists[quest.slug as keyof typeof questChecklists];
  return checklist ? { ...quest, checklist } : quest;
}
