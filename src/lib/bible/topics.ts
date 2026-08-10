import { chapterHref } from "@/lib/bible/links";

/** A reviewed passage that opens at an exact verse or inclusive verse range. */
export interface ScriptureTopicPassage {
  reference: string;
  bookSlug: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  context: string;
}

/** A pastoral topic and the language readers may naturally use to find it. */
export interface ScriptureTopic {
  slug: string;
  title: string;
  summary: string;
  keywords: readonly string[];
  passages: readonly ScriptureTopicPassage[];
}

// This compact catalog keeps topic discovery deterministic and offline while
// chapter text continues to load only after a reader opens a selected passage.
export const SCRIPTURE_TOPICS: readonly ScriptureTopic[] = [
  {
    slug: "forgiveness",
    title: "Forgiveness",
    summary: "Receiving God's mercy and extending it in wounded relationships.",
    keywords: [
      "forgive",
      "forgiven",
      "forgiving",
      "mercy",
      "grace",
      "resentment",
      "bitterness",
      "reconciliation",
    ],
    passages: [
      {
        reference: "Matthew 6:14–15",
        bookSlug: "matthew",
        chapter: 6,
        verseStart: 14,
        verseEnd: 15,
        context:
          "Jesus places forgiving others inside a life shaped by the Father's forgiveness.",
      },
      {
        reference: "Colossians 3:12–13",
        bookSlug: "colossians",
        chapter: 3,
        verseStart: 12,
        verseEnd: 13,
        context:
          "Compassion, patience, and forgiveness belong together in Christian community.",
      },
      {
        reference: "Psalm 103:8–12",
        bookSlug: "psalms",
        chapter: 103,
        verseStart: 8,
        verseEnd: 12,
        context:
          "The psalm describes God's patient mercy and the distance he puts between us and sin.",
      },
    ],
  },
  {
    slug: "anxiety-and-peace",
    title: "Anxiety & peace",
    summary: "Bringing worry to God and practicing trust one day at a time.",
    keywords: [
      "anxiety",
      "anxious",
      "worry",
      "worried",
      "stress",
      "stressed",
      "overwhelmed",
      "panic",
      "calm",
      "peace",
    ],
    passages: [
      {
        reference: "Philippians 4:6–9",
        bookSlug: "philippians",
        chapter: 4,
        verseStart: 6,
        verseEnd: 9,
        context:
          "Paul connects honest prayer, gratitude, focused thought, and the peace of God.",
      },
      {
        reference: "Matthew 6:25–34",
        bookSlug: "matthew",
        chapter: 6,
        verseStart: 25,
        verseEnd: 34,
        context:
          "Jesus points worried hearts toward the Father's care and today's faithful next step.",
      },
      {
        reference: "1 Peter 5:6–7",
        bookSlug: "1-peter",
        chapter: 5,
        verseStart: 6,
        verseEnd: 7,
        context:
          "A short invitation to hand every care to God because he cares for you.",
      },
    ],
  },
  {
    slug: "grief-and-comfort",
    title: "Grief & comfort",
    summary: "Scripture for sorrow, loss, and the hope that does not rush mourning.",
    keywords: [
      "grief",
      "grieving",
      "loss",
      "mourning",
      "sadness",
      "sad",
      "death",
      "bereavement",
      "comfort",
      "brokenhearted",
    ],
    passages: [
      {
        reference: "Psalm 34:17–18",
        bookSlug: "psalms",
        chapter: 34,
        verseStart: 17,
        verseEnd: 18,
        context:
          "God is described as near to the brokenhearted rather than distant from their pain.",
      },
      {
        reference: "John 11:32–36",
        bookSlug: "john",
        chapter: 11,
        verseStart: 32,
        verseEnd: 36,
        context:
          "At Lazarus's tomb, Jesus enters the family's grief and weeps with them.",
      },
      {
        reference: "Revelation 21:3–5",
        bookSlug: "revelation",
        chapter: 21,
        verseStart: 3,
        verseEnd: 5,
        context:
          "A future-facing promise of God's presence, renewed creation, and tears wiped away.",
      },
    ],
  },
  {
    slug: "hope",
    title: "Hope",
    summary: "Waiting with confidence in God's character and promised future.",
    keywords: [
      "hopeful",
      "hopeless",
      "discouraged",
      "discouragement",
      "future",
      "waiting",
      "endurance",
      "encouragement",
    ],
    passages: [
      {
        reference: "Romans 15:13",
        bookSlug: "romans",
        chapter: 15,
        verseStart: 13,
        context:
          "Paul prays for joy, peace, trust, and hope that overflows by the Holy Spirit.",
      },
      {
        reference: "Lamentations 3:21–24",
        bookSlug: "lamentations",
        chapter: 3,
        verseStart: 21,
        verseEnd: 24,
        context:
          "In the middle of lament, the writer remembers God's faithful mercy each morning.",
      },
      {
        reference: "Hebrews 6:18–20",
        bookSlug: "hebrews",
        chapter: 6,
        verseStart: 18,
        verseEnd: 20,
        context:
          "Hope is pictured as an anchor secured by God's promise and Jesus's presence.",
      },
    ],
  },
  {
    slug: "prayer",
    title: "Prayer",
    summary: "Learning to speak honestly with God and listen with trust.",
    keywords: [
      "pray",
      "praying",
      "request",
      "ask God",
      "talk to God",
      "Lord's prayer",
      "intercession",
    ],
    passages: [
      {
        reference: "Matthew 6:5–13",
        bookSlug: "matthew",
        chapter: 6,
        verseStart: 5,
        verseEnd: 13,
        context:
          "Jesus teaches prayer rooted in relationship, simplicity, daily need, and forgiveness.",
      },
      {
        reference: "Psalm 5:1–3",
        bookSlug: "psalms",
        chapter: 5,
        verseStart: 1,
        verseEnd: 3,
        context:
          "A morning pattern of bringing both words and sighs to God, then watching expectantly.",
      },
      {
        reference: "Luke 11:9–13",
        bookSlug: "luke",
        chapter: 11,
        verseStart: 9,
        verseEnd: 13,
        context:
          "Jesus encourages persistent prayer grounded in the goodness of the Father.",
      },
    ],
  },
  {
    slug: "wisdom-and-guidance",
    title: "Wisdom & guidance",
    summary: "Seeking God's direction when the next step is not obvious.",
    keywords: [
      "wisdom",
      "guidance",
      "direction",
      "decision",
      "choices",
      "discernment",
      "advice",
      "what should I do",
    ],
    passages: [
      {
        reference: "James 1:5–8",
        bookSlug: "james",
        chapter: 1,
        verseStart: 5,
        verseEnd: 8,
        context:
          "James invites those who lack wisdom to ask the generous God in faith.",
      },
      {
        reference: "Proverbs 3:5–6",
        bookSlug: "proverbs",
        chapter: 3,
        verseStart: 5,
        verseEnd: 6,
        context:
          "Trust, humility, and acknowledging God shape the path more than self-reliance.",
      },
      {
        reference: "Psalm 119:105",
        bookSlug: "psalms",
        chapter: 119,
        verseStart: 105,
        context:
          "God's word is pictured as enough light for the path immediately ahead.",
      },
    ],
  },
  {
    slug: "love",
    title: "Love",
    summary: "The patient, truthful, self-giving love Jesus forms in his people.",
    keywords: [
      "loving",
      "charity",
      "kindness",
      "neighbor",
      "unconditional love",
      "God's love",
    ],
    passages: [
      {
        reference: "1 Corinthians 13:4–8",
        bookSlug: "1-corinthians",
        chapter: 13,
        verseStart: 4,
        verseEnd: 8,
        context:
          "Paul describes love through durable practices, not merely a feeling.",
      },
      {
        reference: "John 13:34–35",
        bookSlug: "john",
        chapter: 13,
        verseStart: 34,
        verseEnd: 35,
        context:
          "Jesus makes his own love the pattern and public sign of discipleship.",
      },
      {
        reference: "1 John 4:7–12",
        bookSlug: "1-john",
        chapter: 4,
        verseStart: 7,
        verseEnd: 12,
        context:
          "Our love begins with God's initiative and makes his unseen presence visible.",
      },
    ],
  },
  {
    slug: "relationships-and-conflict",
    title: "Relationships & conflict",
    summary: "Practicing honesty, humility, peace, and repair with other people.",
    keywords: [
      "relationship",
      "relationships",
      "conflict",
      "argument",
      "friendship",
      "family",
      "community",
      "communication",
      "reconcile",
      "boundaries",
    ],
    passages: [
      {
        reference: "Romans 12:9–18",
        bookSlug: "romans",
        chapter: 12,
        verseStart: 9,
        verseEnd: 18,
        context:
          "A practical portrait of sincere love, empathy, honor, hospitality, and peacemaking.",
      },
      {
        reference: "Matthew 18:15–20",
        bookSlug: "matthew",
        chapter: 18,
        verseStart: 15,
        verseEnd: 20,
        context:
          "Jesus gives a patient, direct process for addressing harm within a community.",
      },
      {
        reference: "Philippians 2:1–5",
        bookSlug: "philippians",
        chapter: 2,
        verseStart: 1,
        verseEnd: 5,
        context:
          "Unity grows where people resist selfish ambition and attend to one another's good.",
      },
    ],
  },
  {
    slug: "marriage",
    title: "Marriage",
    summary: "Covenant companionship shaped by faithfulness and self-giving love.",
    keywords: [
      "married",
      "spouse",
      "husband",
      "wife",
      "wedding",
      "covenant",
      "couple",
      "intimacy",
    ],
    passages: [
      {
        reference: "Genesis 2:18–24",
        bookSlug: "genesis",
        chapter: 2,
        verseStart: 18,
        verseEnd: 24,
        context:
          "The creation story introduces companionship and the covenant union of two lives.",
      },
      {
        reference: "Ephesians 5:21–33",
        bookSlug: "ephesians",
        chapter: 5,
        verseStart: 21,
        verseEnd: 33,
        context:
          "Paul frames Christian households with mutual submission and Christlike, self-giving love.",
      },
      {
        reference: "1 Corinthians 13:4–7",
        bookSlug: "1-corinthians",
        chapter: 13,
        verseStart: 4,
        verseEnd: 7,
        context:
          "These concrete qualities of love offer a searching practice for life together.",
      },
    ],
  },
  {
    slug: "anger-and-patience",
    title: "Anger & patience",
    summary: "Slowing reactive anger and choosing truthful, healing responses.",
    keywords: [
      "angry",
      "rage",
      "temper",
      "frustrated",
      "frustration",
      "patience",
      "irritated",
      "self-control",
    ],
    passages: [
      {
        reference: "James 1:19–20",
        bookSlug: "james",
        chapter: 1,
        verseStart: 19,
        verseEnd: 20,
        context:
          "Quick listening and slow speech interrupt the kind of anger that cannot produce God's justice.",
      },
      {
        reference: "Ephesians 4:26–32",
        bookSlug: "ephesians",
        chapter: 4,
        verseStart: 26,
        verseEnd: 32,
        context:
          "Paul takes anger seriously while directing it toward timely repair and gracious speech.",
      },
      {
        reference: "Proverbs 15:1",
        bookSlug: "proverbs",
        chapter: 15,
        verseStart: 1,
        context:
          "A gentle answer can change the temperature of a tense exchange.",
      },
    ],
  },
  {
    slug: "gratitude",
    title: "Gratitude",
    summary: "Learning to notice gifts and give thanks in every season.",
    keywords: [
      "grateful",
      "thankful",
      "thanks",
      "thanksgiving",
      "contentment",
      "appreciation",
      "joy",
    ],
    passages: [
      {
        reference: "1 Thessalonians 5:16–18",
        bookSlug: "1-thessalonians",
        chapter: 5,
        verseStart: 16,
        verseEnd: 18,
        context:
          "Joy, prayer, and thanksgiving become a steady rhythm rather than a denial of hardship.",
      },
      {
        reference: "Psalm 100:1–5",
        bookSlug: "psalms",
        chapter: 100,
        verseStart: 1,
        verseEnd: 5,
        context:
          "This psalm roots thankful worship in God's goodness, care, and enduring faithfulness.",
      },
      {
        reference: "Colossians 3:15–17",
        bookSlug: "colossians",
        chapter: 3,
        verseStart: 15,
        verseEnd: 17,
        context:
          "Gratitude threads through peace, worship, community, speech, and ordinary action.",
      },
    ],
  },
  {
    slug: "faith-and-doubt",
    title: "Faith & doubt",
    summary: "Trusting Jesus honestly when certainty feels out of reach.",
    keywords: [
      "faith",
      "doubt",
      "doubting",
      "belief",
      "believe",
      "unbelief",
      "trust God",
      "skeptic",
      "questions",
    ],
    passages: [
      {
        reference: "Mark 9:23–24",
        bookSlug: "mark",
        chapter: 9,
        verseStart: 23,
        verseEnd: 24,
        context:
          "A father brings belief and unbelief to Jesus in the same honest prayer.",
      },
      {
        reference: "John 20:24–29",
        bookSlug: "john",
        chapter: 20,
        verseStart: 24,
        verseEnd: 29,
        context:
          "The risen Jesus meets Thomas inside his questions and invites him toward faith.",
      },
      {
        reference: "Hebrews 11:1–6",
        bookSlug: "hebrews",
        chapter: 11,
        verseStart: 1,
        verseEnd: 6,
        context:
          "Faith is introduced as active confidence in God's reality, character, and promises.",
      },
    ],
  },
  {
    slug: "loneliness-and-belonging",
    title: "Loneliness & belonging",
    summary: "Remembering God's presence and seeking life-giving community.",
    keywords: [
      "lonely",
      "alone",
      "isolated",
      "isolation",
      "belong",
      "belonging",
      "friendless",
      "abandoned",
      "community",
    ],
    passages: [
      {
        reference: "Psalm 68:5–6",
        bookSlug: "psalms",
        chapter: 68,
        verseStart: 5,
        verseEnd: 6,
        context:
          "God's care includes defending vulnerable people and placing the lonely in family.",
      },
      {
        reference: "Isaiah 41:8–10",
        bookSlug: "isaiah",
        chapter: 41,
        verseStart: 8,
        verseEnd: 10,
        context:
          "God tells his people they are chosen, accompanied, strengthened, and upheld.",
      },
      {
        reference: "Hebrews 10:23–25",
        bookSlug: "hebrews",
        chapter: 10,
        verseStart: 23,
        verseEnd: 25,
        context:
          "Hope is sustained in a community that gathers, encourages, and stirs up love.",
      },
    ],
  },
  {
    slug: "temptation",
    title: "Temptation",
    summary: "Recognizing pressure, receiving grace, and choosing a faithful way through.",
    keywords: [
      "tempted",
      "sin",
      "habit",
      "addiction",
      "urge",
      "self-control",
      "resist",
      "struggle",
    ],
    passages: [
      {
        reference: "1 Corinthians 10:12–13",
        bookSlug: "1-corinthians",
        chapter: 10,
        verseStart: 12,
        verseEnd: 13,
        context:
          "Paul pairs humility about our weakness with God's faithfulness and a real way through.",
      },
      {
        reference: "Hebrews 4:14–16",
        bookSlug: "hebrews",
        chapter: 4,
        verseStart: 14,
        verseEnd: 16,
        context:
          "Because Jesus understands testing, we can approach him for timely mercy and help.",
      },
      {
        reference: "James 1:12–16",
        bookSlug: "james",
        chapter: 1,
        verseStart: 12,
        verseEnd: 16,
        context:
          "James traces how desire grows into sin so it can be recognized before it matures.",
      },
    ],
  },
  {
    slug: "fear-and-courage",
    title: "Fear & courage",
    summary: "Facing what frightens us with God's presence rather than bravado.",
    keywords: [
      "fear",
      "afraid",
      "scared",
      "courage",
      "brave",
      "danger",
      "uncertain",
      "timid",
    ],
    passages: [
      {
        reference: "Isaiah 41:10",
        bookSlug: "isaiah",
        chapter: 41,
        verseStart: 10,
        context:
          "Courage rests on God's presence, help, strength, and sustaining hand.",
      },
      {
        reference: "Psalm 56:3–4",
        bookSlug: "psalms",
        chapter: 56,
        verseStart: 3,
        verseEnd: 4,
        context:
          "The psalm does not hide fear; it turns fear into a deliberate act of trust.",
      },
      {
        reference: "2 Timothy 1:6–7",
        bookSlug: "2-timothy",
        chapter: 1,
        verseStart: 6,
        verseEnd: 7,
        context:
          "God's gift is tended through power, love, and sound judgment rather than timidity.",
      },
    ],
  },
  {
    slug: "purpose-and-calling",
    title: "Purpose & calling",
    summary: "Offering ordinary life to God and walking in the good prepared for us.",
    keywords: [
      "purpose",
      "calling",
      "vocation",
      "work",
      "career",
      "meaning",
      "mission",
      "gifts",
      "God's will",
    ],
    passages: [
      {
        reference: "Ephesians 2:8–10",
        bookSlug: "ephesians",
        chapter: 2,
        verseStart: 8,
        verseEnd: 10,
        context:
          "Grace comes before achievement, then sends God's workmanship into prepared good work.",
      },
      {
        reference: "Micah 6:6–8",
        bookSlug: "micah",
        chapter: 6,
        verseStart: 6,
        verseEnd: 8,
        context:
          "A faithful life is distilled into justice, mercy, and humble companionship with God.",
      },
      {
        reference: "Romans 12:1–2",
        bookSlug: "romans",
        chapter: 12,
        verseStart: 1,
        verseEnd: 2,
        context:
          "Purpose grows through offering the whole self and learning a renewed way to discern.",
      },
    ],
  },
  {
    slug: "rest",
    title: "Rest",
    summary: "Receiving limits, quiet, and restoration as gifts from God.",
    keywords: [
      "restful",
      "tired",
      "exhausted",
      "burnout",
      "weary",
      "sleep",
      "sabbath",
      "busy",
      "stillness",
    ],
    passages: [
      {
        reference: "Matthew 11:28–30",
        bookSlug: "matthew",
        chapter: 11,
        verseStart: 28,
        verseEnd: 30,
        context:
          "Jesus invites the weary to learn his gentle way and carry a different kind of yoke.",
      },
      {
        reference: "Psalm 23:1–6",
        bookSlug: "psalms",
        chapter: 23,
        verseStart: 1,
        verseEnd: 6,
        context:
          "The shepherd's presence provides rest, guidance, courage, and enough for the whole journey.",
      },
      {
        reference: "Hebrews 4:9–11",
        bookSlug: "hebrews",
        chapter: 4,
        verseStart: 9,
        verseEnd: 11,
        context:
          "Sabbath rest is held out as a continuing promise for the people of God.",
      },
    ],
  },
];

// Common filler words are ignored so a natural query such as “how can I
// forgive someone?” still reaches the reviewed forgiveness passages.
const SEARCH_STOP_WORDS = new Set([
  "about",
  "and",
  "can",
  "find",
  "for",
  "from",
  "have",
  "help",
  "how",
  "someone",
  "that",
  "the",
  "their",
  "them",
  "this",
  "what",
  "when",
  "where",
  "with",
]);

/** Normalizes punctuation and spacing without using locale- or network-dependent behavior. */
function normalizeTopicQuery(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Scores exact labels first, then aliases and meaningful words in natural queries. */
function scoreTopic(topic: ScriptureTopic, normalizedQuery: string): number {
  const terms = [topic.title, ...topic.keywords].map(normalizeTopicQuery);
  const queryWords = normalizedQuery
    .split(" ")
    .filter(
      (word) => word.length >= 3 && !SEARCH_STOP_WORDS.has(word),
    );
  const meaningfulWholeQuery =
    normalizedQuery.length >= 3 && !SEARCH_STOP_WORDS.has(normalizedQuery);

  let score = 0;
  if (meaningfulWholeQuery && terms[0] === normalizedQuery) score += 140;
  else if (meaningfulWholeQuery && terms.includes(normalizedQuery)) score += 120;
  else if (
    meaningfulWholeQuery &&
    terms.some((term) => term.includes(normalizedQuery))
  ) {
    score += 70;
  }

  for (const word of queryWords) {
    const wordScore = Math.max(
      ...terms.map((term) => {
        if (term === word) return 36;
        if (term.startsWith(word) || word.startsWith(term)) return 24;
        if (term.includes(word) || word.includes(term)) return 12;
        return 0;
      }),
    );
    score += wordScore;
  }

  return score;
}

/** Returns a stable, relevance-ranked subset of the local reviewed catalog. */
export function searchScriptureTopics(
  query: string,
  limit = 4,
): readonly ScriptureTopic[] {
  const normalizedQuery = normalizeTopicQuery(query);
  if (!normalizedQuery || limit <= 0) return [];

  return SCRIPTURE_TOPICS.map((topic, index) => ({
    topic,
    index,
    score: scoreTopic(topic, normalizedQuery),
  }))
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.index - right.index,
    )
    .slice(0, Math.floor(limit))
    .map((result) => result.topic);
}

/** Builds the existing reader URL and highlights the reviewed verse range. */
export function topicPassageHref(
  passage: ScriptureTopicPassage,
): string {
  const verse = passage.verseEnd
    ? `${passage.verseStart}-${passage.verseEnd}`
    : passage.verseStart;

  return chapterHref(passage.bookSlug, passage.chapter, {
    verse,
    anchor: passage.verseStart,
  });
}
