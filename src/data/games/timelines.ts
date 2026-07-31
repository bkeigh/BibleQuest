import type { TimelinePuzzle } from "@/lib/games/types";

/** Reviewed timelines name the ordering frame so chronology stays honest. */
export const timelinePuzzles = [
  {
    id: "timeline-exodus",
    contentVersion: 1,
    kind: "timeline",
    title: "From the bush to the mountain",
    description: "Place four moments from the Exodus story in narrative order.",
    estimatedMinutes: 3,
    themePack: "scripture-foundations",
    items: [
      {
        id: "burning-bush",
        label: "God speaks to Moses from the burning bush",
        explanation:
          "Moses encounters God at Horeb and is called to lead Israel out of Egypt.",
        source: {
          reference: "Exodus 3:1–10",
          bookSlug: "exodus",
          chapter: 3,
          verseStart: 1,
          verseEnd: 10,
        },
      },
      {
        id: "passover",
        label: "Israel keeps the first Passover",
        explanation:
          "The Passover meal comes on the night before Israel leaves Egypt.",
        source: {
          reference: "Exodus 12:21–32",
          bookSlug: "exodus",
          chapter: 12,
          verseStart: 21,
          verseEnd: 32,
        },
      },
      {
        id: "sea-crossing",
        label: "Israel crosses through the sea",
        explanation:
          "After leaving Egypt, Israel passes through the sea on dry ground.",
        source: {
          reference: "Exodus 14:21–31",
          bookSlug: "exodus",
          chapter: 14,
          verseStart: 21,
          verseEnd: 31,
        },
      },
      {
        id: "sinai",
        label: "Israel gathers at Mount Sinai",
        explanation:
          "The people reach Sinai, where God calls them to covenant faithfulness.",
        source: {
          reference: "Exodus 19:1–6",
          bookSlug: "exodus",
          chapter: 19,
          verseStart: 1,
          verseEnd: 6,
        },
      },
    ],
    learning: {
      title: "Deliverance becomes a covenant journey",
      summary:
        "Exodus moves from calling, through deliverance, toward a people learning to live in covenant with God.",
      sources: [
        {
          reference: "Exodus 3:1–10",
          bookSlug: "exodus",
          chapter: 3,
          verseStart: 1,
          verseEnd: 10,
        },
        {
          reference: "Exodus 12:21–32",
          bookSlug: "exodus",
          chapter: 12,
          verseStart: 21,
          verseEnd: 32,
        },
        {
          reference: "Exodus 14:21–31",
          bookSlug: "exodus",
          chapter: 14,
          verseStart: 21,
          verseEnd: 31,
        },
        {
          reference: "Exodus 19:1–6",
          bookSlug: "exodus",
          chapter: 19,
          verseStart: 1,
          verseEnd: 6,
        },
      ],
      readSource: {
        reference: "Exodus 14:21–31",
        bookSlug: "exodus",
        chapter: 14,
        verseStart: 21,
        verseEnd: 31,
      },
      relatedQuestSlug: "carry-a-verse-through-your-afternoon",
      relatedQuestLabel: "Carry this Scripture",
    },
    review: {
      status: "reviewed",
      scriptureNote:
        "The order follows the Exodus narrative and each moment links to its own passage.",
      ambiguityNote:
        "All four events are separated by explicit chapter order; no alternate narrative order is defensible.",
    },
  },
  {
    id: "timeline-david",
    contentVersion: 1,
    kind: "timeline",
    title: "David before the throne",
    description: "Arrange four moments from David’s early story in narrative order.",
    estimatedMinutes: 3,
    themePack: "people-of-scripture",
    items: [
      {
        id: "david-anointed",
        label: "Samuel anoints David",
        explanation:
          "Samuel anoints the youngest son of Jesse while Saul is still king.",
        source: {
          reference: "1 Samuel 16:10–13",
          bookSlug: "1-samuel",
          chapter: 16,
          verseStart: 10,
          verseEnd: 13,
        },
      },
      {
        id: "goliath",
        label: "David faces Goliath",
        explanation:
          "David trusts God and meets the Philistine champion with a sling and stones.",
        source: {
          reference: "1 Samuel 17:40–50",
          bookSlug: "1-samuel",
          chapter: 17,
          verseStart: 40,
          verseEnd: 50,
        },
      },
      {
        id: "saul-spared",
        label: "David spares Saul in the cave",
        explanation:
          "Although Saul is pursuing him, David refuses to take the king’s life.",
        source: {
          reference: "1 Samuel 24:3–12",
          bookSlug: "1-samuel",
          chapter: 24,
          verseStart: 3,
          verseEnd: 12,
        },
      },
      {
        id: "david-king",
        label: "David becomes king over all Israel",
        explanation:
          "The elders of Israel come to Hebron and anoint David as king.",
        source: {
          reference: "2 Samuel 5:1–5",
          bookSlug: "2-samuel",
          chapter: 5,
          verseStart: 1,
          verseEnd: 5,
        },
      },
    ],
    learning: {
      title: "Calling did not remove the long road",
      summary:
        "David’s anointing came long before his reign. The chapters between them hold courage, danger, restraint, and waiting.",
      sources: [
        {
          reference: "1 Samuel 16:10–13",
          bookSlug: "1-samuel",
          chapter: 16,
          verseStart: 10,
          verseEnd: 13,
        },
        {
          reference: "1 Samuel 24:3–12",
          bookSlug: "1-samuel",
          chapter: 24,
          verseStart: 3,
          verseEnd: 12,
        },
        {
          reference: "2 Samuel 5:1–5",
          bookSlug: "2-samuel",
          chapter: 5,
          verseStart: 1,
          verseEnd: 5,
        },
      ],
      readSource: {
        reference: "1 Samuel 24:3–12",
        bookSlug: "1-samuel",
        chapter: 24,
        verseStart: 3,
        verseEnd: 12,
      },
      relatedQuestSlug: "practice-hidden-faithfulness",
      relatedQuestLabel: "Live this Scripture",
    },
    review: {
      status: "reviewed",
      scriptureNote:
        "The order follows 1 Samuel into 2 Samuel without claiming a date more precise than the narrative gives.",
      ambiguityNote:
        "Each event occupies a distinct narrative location and the ordering frame is stated in the instructions.",
    },
  },
  {
    id: "timeline-holy-week",
    contentVersion: 1,
    kind: "timeline",
    title: "Toward the empty tomb",
    description: "Place four moments from Matthew’s final chapters in narrative order.",
    estimatedMinutes: 3,
    themePack: "life-of-jesus",
    items: [
      {
        id: "jerusalem-entry",
        label: "Jesus enters Jerusalem",
        explanation:
          "Crowds welcome Jesus into the city as he rides on a donkey.",
        source: {
          reference: "Matthew 21:1–11",
          bookSlug: "matthew",
          chapter: 21,
          verseStart: 1,
          verseEnd: 11,
        },
      },
      {
        id: "last-supper",
        label: "Jesus shares the Passover meal",
        explanation:
          "Jesus eats with the disciples and gives the bread and cup.",
        source: {
          reference: "Matthew 26:17–30",
          bookSlug: "matthew",
          chapter: 26,
          verseStart: 17,
          verseEnd: 30,
        },
      },
      {
        id: "crucifixion",
        label: "Jesus is crucified",
        explanation:
          "Matthew tells of Jesus’ death at Golgotha and the events surrounding it.",
        source: {
          reference: "Matthew 27:32–54",
          bookSlug: "matthew",
          chapter: 27,
          verseStart: 32,
          verseEnd: 54,
        },
      },
      {
        id: "empty-tomb",
        label: "The women find the tomb empty",
        explanation:
          "At dawn on the first day of the week, the women receive the news that Jesus has risen.",
        source: {
          reference: "Matthew 28:1–10",
          bookSlug: "matthew",
          chapter: 28,
          verseStart: 1,
          verseEnd: 10,
        },
      },
    ],
    learning: {
      title: "The story moves through the cross to resurrection",
      summary:
        "Reading the sequence keeps celebration, table fellowship, suffering, and resurrection within one connected Gospel story.",
      sources: [
        {
          reference: "Matthew 21:1–11",
          bookSlug: "matthew",
          chapter: 21,
          verseStart: 1,
          verseEnd: 11,
        },
        {
          reference: "Matthew 26:17–30",
          bookSlug: "matthew",
          chapter: 26,
          verseStart: 17,
          verseEnd: 30,
        },
        {
          reference: "Matthew 27:32–54",
          bookSlug: "matthew",
          chapter: 27,
          verseStart: 32,
          verseEnd: 54,
        },
        {
          reference: "Matthew 28:1–10",
          bookSlug: "matthew",
          chapter: 28,
          verseStart: 1,
          verseEnd: 10,
        },
      ],
      readSource: {
        reference: "Matthew 28:1–10",
        bookSlug: "matthew",
        chapter: 28,
        verseStart: 1,
        verseEnd: 10,
      },
      relatedQuestSlug: "compare-two-resurrection-accounts",
      relatedQuestLabel: "Continue studying",
    },
    review: {
      status: "reviewed",
      scriptureNote:
        "All four moments come from Matthew, avoiding differences created by merging Gospel chronologies.",
      ambiguityNote:
        "Matthew’s chapter sequence makes the intended narrative order explicit and unambiguous.",
    },
  },
] as const satisfies readonly TimelinePuzzle[];
