import type { ConnectionsPuzzle } from "@/lib/games/types";

/** Reviewed, source-linked puzzles stay static so every answer is inspectable. */
export const connectionPuzzles = [
  {
    id: "connections-books-rivers-soils",
    contentVersion: 1,
    kind: "connections",
    title: "Books, rivers, and soils",
    description: "Find three sets of four terms woven through Scripture.",
    estimatedMinutes: 4,
    themePack: "scripture-foundations",
    groups: [
      {
        id: "gospel-books",
        title: "The four Gospel books",
        terms: ["Matthew", "Mark", "Luke", "John"],
        explanation:
          "These four books tell the good news of Jesus from distinct, complementary perspectives.",
        sources: [
          {
            reference: "Matthew 1:1",
            bookSlug: "matthew",
            chapter: 1,
            verseStart: 1,
          },
          {
            reference: "Mark 1:1",
            bookSlug: "mark",
            chapter: 1,
            verseStart: 1,
          },
          {
            reference: "Luke 1:1–4",
            bookSlug: "luke",
            chapter: 1,
            verseStart: 1,
            verseEnd: 4,
          },
          {
            reference: "John 20:30–31",
            bookSlug: "john",
            chapter: 20,
            verseStart: 30,
            verseEnd: 31,
          },
        ],
      },
      {
        id: "eden-rivers",
        title: "Rivers flowing from Eden",
        terms: ["Pishon", "Gihon", "Hiddekel", "Euphrates"],
        explanation:
          "Genesis names four river branches flowing from the river that watered Eden.",
        sources: [
          {
            reference: "Genesis 2:10–14",
            bookSlug: "genesis",
            chapter: 2,
            verseStart: 10,
            verseEnd: 14,
          },
        ],
      },
      {
        id: "parable-soils",
        title: "Soils in the parable of the sower",
        terms: ["Roadside", "Rocky ground", "Among thorns", "Good ground"],
        explanation:
          "Jesus described seed falling in four places, then explained how people receive the word.",
        sources: [
          {
            reference: "Mark 4:3–20",
            bookSlug: "mark",
            chapter: 4,
            verseStart: 3,
            verseEnd: 20,
          },
        ],
      },
    ],
    learning: {
      title: "Scripture often teaches through patterns",
      summary:
        "Books, places, and images each carry part of the biblical story. Seeing their relationships can invite a slower reading of the passages around them.",
      sources: [
        {
          reference: "Genesis 2:10–14",
          bookSlug: "genesis",
          chapter: 2,
          verseStart: 10,
          verseEnd: 14,
        },
        {
          reference: "Mark 4:3–20",
          bookSlug: "mark",
          chapter: 4,
          verseStart: 3,
          verseEnd: 20,
        },
      ],
      readSource: {
        reference: "Mark 4:3–20",
        bookSlug: "mark",
        chapter: 4,
        verseStart: 3,
        verseEnd: 20,
      },
      relatedQuestSlug: "begin-a-gospel",
      relatedQuestLabel: "Continue studying",
    },
    review: {
      status: "reviewed",
      scriptureNote:
        "Names and categories were checked against the bundled World English Bible and their surrounding passages.",
      ambiguityNote:
        "Terms are unique within the puzzle; the three categories do not share a defensible alternate four-term grouping.",
    },
  },
  {
    id: "connections-prayer-spirit-armor",
    contentVersion: 1,
    kind: "connections",
    title: "Prayer, fruit, and armor",
    description: "Notice three teachings that gather ordinary words into a larger whole.",
    estimatedMinutes: 4,
    themePack: "teachings-of-faith",
    groups: [
      {
        id: "lords-prayer-petitions",
        title: "Petitions near the beginning of the Lord’s Prayer",
        terms: ["Name made holy", "Kingdom come", "Will be done", "Daily bread"],
        explanation:
          "Jesus begins this model prayer with God’s name, kingdom, and will before asking for daily provision.",
        sources: [
          {
            reference: "Matthew 6:9–11",
            bookSlug: "matthew",
            chapter: 6,
            verseStart: 9,
            verseEnd: 11,
          },
        ],
      },
      {
        id: "fruit-first-four",
        title: "The first four qualities named as fruit of the Spirit",
        terms: ["Love", "Joy", "Peace", "Patience"],
        explanation:
          "Paul names these first within one fruit of the Spirit, followed by kindness, goodness, faith, gentleness, and self-control.",
        sources: [
          {
            reference: "Galatians 5:22–23",
            bookSlug: "galatians",
            chapter: 5,
            verseStart: 22,
            verseEnd: 23,
          },
        ],
      },
      {
        id: "armor-pieces",
        title: "Images in the armor of God",
        terms: ["Belt of truth", "Breastplate of righteousness", "Shield of faith", "Helmet of salvation"],
        explanation:
          "Ephesians uses the image of armor to describe a life grounded in God’s truth, righteousness, faith, and salvation.",
        sources: [
          {
            reference: "Ephesians 6:13–17",
            bookSlug: "ephesians",
            chapter: 6,
            verseStart: 13,
            verseEnd: 17,
          },
        ],
      },
    ],
    learning: {
      title: "Lists can become practices",
      summary:
        "These passages are not trivia lists alone. They offer words for prayer, qualities to cultivate, and images for faithful endurance.",
      sources: [
        {
          reference: "Matthew 6:9–13",
          bookSlug: "matthew",
          chapter: 6,
          verseStart: 9,
          verseEnd: 13,
        },
        {
          reference: "Galatians 5:22–23",
          bookSlug: "galatians",
          chapter: 5,
          verseStart: 22,
          verseEnd: 23,
        },
        {
          reference: "Ephesians 6:13–17",
          bookSlug: "ephesians",
          chapter: 6,
          verseStart: 13,
          verseEnd: 17,
        },
      ],
      readSource: {
        reference: "Matthew 6:9–13",
        bookSlug: "matthew",
        chapter: 6,
        verseStart: 9,
        verseEnd: 13,
      },
      relatedQuestSlug: "the-lords-prayer-slowly",
      relatedQuestLabel: "Pray with this Scripture",
    },
    review: {
      status: "reviewed",
      scriptureNote:
        "Every phrase is a close label for its cited passage; the learning copy avoids treating metaphor as a physical promise.",
      ambiguityNote:
        "Category labels identify bounded passage lists, and no term appears in more than one answer group.",
    },
  },
  {
    id: "connections-wilderness-revelation-ministry",
    contentVersion: 1,
    kind: "connections",
    title: "Wilderness, visions, and service",
    description: "Find the passage that holds each group together.",
    estimatedMinutes: 5,
    themePack: "biblical-lore",
    groups: [
      {
        id: "wilderness-signs",
        title: "Signs during Israel’s wilderness journey",
        terms: ["Manna", "Quail", "Water from rock", "Bronze serpent"],
        explanation:
          "These signs appear during Israel’s wilderness years, amid both God’s provision and the people’s struggle.",
        sources: [
          {
            reference: "Exodus 16:13–15",
            bookSlug: "exodus",
            chapter: 16,
            verseStart: 13,
            verseEnd: 15,
          },
          {
            reference: "Exodus 17:5–6",
            bookSlug: "exodus",
            chapter: 17,
            verseStart: 5,
            verseEnd: 6,
          },
          {
            reference: "Numbers 21:8–9",
            bookSlug: "numbers",
            chapter: 21,
            verseStart: 8,
            verseEnd: 9,
          },
        ],
      },
      {
        id: "living-creatures",
        title: "Faces of the four living creatures",
        terms: ["Lion", "Calf", "Human face", "Flying eagle"],
        explanation:
          "John’s throne-room vision describes four living creatures with these four appearances.",
        sources: [
          {
            reference: "Revelation 4:6–8",
            bookSlug: "revelation",
            chapter: 4,
            verseStart: 6,
            verseEnd: 8,
          },
        ],
      },
      {
        id: "romans-gifts",
        title: "Gifts named together in Romans 12",
        terms: ["Prophecy", "Service", "Teaching", "Exhortation"],
        explanation:
          "Paul names different gifts within one body and calls each person to use what has been given with care.",
        sources: [
          {
            reference: "Romans 12:4–8",
            bookSlug: "romans",
            chapter: 12,
            verseStart: 4,
            verseEnd: 8,
          },
        ],
      },
    ],
    learning: {
      title: "Context turns lore into formation",
      summary:
        "Memorable images become more meaningful when they lead back to their passages: provision in the wilderness, worship around God’s throne, and humble service within one body.",
      sources: [
        {
          reference: "Exodus 16:13–15",
          bookSlug: "exodus",
          chapter: 16,
          verseStart: 13,
          verseEnd: 15,
        },
        {
          reference: "Revelation 4:6–8",
          bookSlug: "revelation",
          chapter: 4,
          verseStart: 6,
          verseEnd: 8,
        },
        {
          reference: "Romans 12:4–8",
          bookSlug: "romans",
          chapter: 12,
          verseStart: 4,
          verseEnd: 8,
        },
      ],
      readSource: {
        reference: "Romans 12:4–8",
        bookSlug: "romans",
        chapter: 12,
        verseStart: 4,
        verseEnd: 8,
      },
      relatedQuestSlug: "serve-without-being-seen",
      relatedQuestLabel: "Live this Scripture",
    },
    review: {
      status: "reviewed",
      scriptureNote:
        "Images and gifts were checked in their cited contexts; explanations distinguish narrative, vision, and teaching.",
      ambiguityNote:
        "The compound term labels keep the wilderness items distinct, and all twelve terms have only one intended passage group.",
    },
  },
] as const satisfies readonly ConnectionsPuzzle[];
