import type { SevenDaysChapter } from "./types";

/**
 * Seven chapters, one per day of Genesis 1:1–2:3.
 *
 * Every question is answerable from the verses it cites, and every answer
 * carries its explanation and a link into the chapter reader — the game never
 * withholds an answer, sells a hint, or asks the reader to take a claim on
 * trust. Questions stay with what the passage says rather than what a tradition
 * concludes from it, so a family from any church can play the same board.
 *
 * Wording follows the World English Bible, the edition BibleQuest bundles.
 */
export const SEVEN_DAYS_CONTENT_VERSION = 1;

export const SEVEN_DAYS_CHAPTERS: readonly SevenDaysChapter[] = [
  {
    id: "day-1",
    day: 1,
    title: "Let There Be Light",
    summary:
      "The first word spoken over a formless world, and the first thing given a name.",
    signature: "light",
    source: {
      reference: "Genesis 1:1–5",
      bookSlug: "genesis",
      chapter: 1,
      verseStart: 1,
      verseEnd: 5,
    },
    questions: [
      {
        id: "day-1-q1",
        prompt: "What does Genesis say God created in the beginning?",
        options: [
          "The garden of Eden",
          "The heavens and the earth",
          "The sun and the moon",
        ],
        answerIndex: 1,
        explanation:
          "Genesis opens with the whole of it: “In the beginning, God created the heavens and the earth.” The garden and the lights come later in the account.",
        source: {
          reference: "Genesis 1:1",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 1,
        },
      },
      {
        id: "day-1-q2",
        prompt: "How does the passage describe the earth before God speaks?",
        options: [
          "Formless and empty",
          "Green and growing",
          "Crowded with creatures",
        ],
        answerIndex: 0,
        explanation:
          "“The earth was formless and empty.” The days that follow answer both halves: first the world is given shape, then it is filled.",
        source: {
          reference: "Genesis 1:2",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 2,
        },
      },
      {
        id: "day-1-q3",
        prompt: "What was hovering over the surface of the waters?",
        options: [
          "A pillar of fire",
          "A wind out of the east",
          "God’s Spirit",
        ],
        answerIndex: 2,
        explanation:
          "“God’s Spirit was hovering over the surface of the waters.” The fire and the east wind belong to Exodus, much later in the story.",
        source: {
          reference: "Genesis 1:2",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 2,
        },
      },
      {
        id: "day-1-q4",
        prompt: "What are the first recorded words God speaks?",
        options: [
          "“Let the dry land appear”",
          "“Let there be light”",
          "“Let us make man in our image”",
        ],
        answerIndex: 1,
        explanation:
          "“God said, ‘Let there be light,’ and there was light.” The other two lines are also in Genesis 1, on the third and sixth days.",
        source: {
          reference: "Genesis 1:3",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 3,
        },
      },
      {
        id: "day-1-q5",
        prompt: "After making light, what did God divide it from?",
        options: ["The darkness", "The waters", "The dry land"],
        answerIndex: 0,
        explanation:
          "“God divided the light from the darkness.” Dividing is the work of the first three days: light from dark, waters from waters, sea from land.",
        source: {
          reference: "Genesis 1:4",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 4,
        },
      },
      {
        id: "day-1-q6",
        prompt: "What names does God give to the light and the darkness?",
        options: [
          "“Morning” and “evening”",
          "“Heaven” and “deep”",
          "“Day” and “night”",
        ],
        answerIndex: 2,
        explanation:
          "“God called the light ‘day’, and the darkness he called ‘night’.” Evening and morning are how the passage counts a day, not what they are named.",
        source: {
          reference: "Genesis 1:5",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 5,
        },
      },
      {
        id: "day-1-q7",
        prompt: "Which phrase closes each day of the account?",
        options: [
          "“There was evening and there was morning”",
          "“And the sun went down”",
          "“God rested from his work”",
        ],
        answerIndex: 0,
        explanation:
          "Every day ends with “There was evening and there was morning.” Resting comes only once, on the seventh day.",
        source: {
          reference: "Genesis 1:5",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 5,
        },
      },
    ],
  },
  {
    id: "day-2",
    day: 2,
    title: "The Waters Divided",
    summary: "A space opened in the middle of the waters, and given a name.",
    signature: "waters",
    source: {
      reference: "Genesis 1:6–8",
      bookSlug: "genesis",
      chapter: 1,
      verseStart: 6,
      verseEnd: 8,
    },
    questions: [
      {
        id: "day-2-q1",
        prompt: "What does God call for on the second day?",
        options: [
          "A garden in the east",
          "An expanse in the middle of the waters",
          "Lights to mark the seasons",
        ],
        answerIndex: 1,
        explanation:
          "“Let there be an expanse in the middle of the waters.” The lights arrive on the fourth day; the garden is a later chapter.",
        source: {
          reference: "Genesis 1:6",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 6,
        },
      },
      {
        id: "day-2-q2",
        prompt: "What is the expanse made to divide?",
        options: [
          "The waters from the waters",
          "The light from the darkness",
          "The land from the sea",
        ],
        answerIndex: 0,
        explanation:
          "“Let it divide the waters from the waters.” Light was divided from darkness on day one; sea from land comes on day three.",
        source: {
          reference: "Genesis 1:6",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 6,
        },
      },
      {
        id: "day-2-q3",
        prompt: "Where are the divided waters placed?",
        options: [
          "All of them below the expanse",
          "All of them beyond the seas",
          "Some under the expanse and some above it",
        ],
        answerIndex: 2,
        explanation:
          "God “divided the waters which were under the expanse from the waters which were above the expanse.”",
        source: {
          reference: "Genesis 1:7",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 7,
        },
      },
      {
        id: "day-2-q4",
        prompt: "What does God name the expanse?",
        options: ["“Sky”", "“Sea”", "“Deep”"],
        answerIndex: 0,
        explanation:
          "“God called the expanse ‘sky’.” The seas are named on the third day, and “the deep” describes the waters before day one.",
        source: {
          reference: "Genesis 1:8",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 8,
        },
      },
      {
        id: "day-2-q5",
        prompt: "Which short phrase follows God’s word about the expanse?",
        options: [
          "“And it was very good”",
          "“And it was so”",
          "“And God rested”",
        ],
        answerIndex: 1,
        explanation:
          "“And it was so” is the account’s way of saying the word took effect. “Very good” is said once, over everything, on the sixth day.",
        source: {
          reference: "Genesis 1:7",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 7,
        },
      },
      {
        id: "day-2-q6",
        prompt: "Which day of the account is this?",
        options: ["The first day", "The third day", "A second day"],
        answerIndex: 2,
        explanation:
          "“There was evening and there was morning, a second day.” The dividing of the waters sits between light and dry land.",
        source: {
          reference: "Genesis 1:8",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 8,
        },
      },
      {
        id: "day-2-q7",
        prompt: "So far in the account, what is God mostly doing?",
        options: [
          "Separating one thing from another",
          "Naming the animals",
          "Planting and harvesting",
        ],
        answerIndex: 0,
        explanation:
          "Days one and two divide: light from darkness, then waters from waters. Filling what has been separated begins later.",
        source: {
          reference: "Genesis 1:6–8",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 6,
          verseEnd: 8,
        },
      },
    ],
  },
  {
    id: "day-3",
    day: 3,
    title: "Dry Land and Seed",
    summary:
      "The waters gather, the land appears, and the earth is told to bring forth.",
    signature: "land",
    source: {
      reference: "Genesis 1:9–13",
      bookSlug: "genesis",
      chapter: 1,
      verseStart: 9,
      verseEnd: 13,
    },
    questions: [
      {
        id: "day-3-q1",
        prompt: "What has to happen before the dry land can appear?",
        options: [
          "The waters are gathered to one place",
          "The lights are set in the sky",
          "The birds are told to multiply",
        ],
        answerIndex: 0,
        explanation:
          "“Let the waters under the sky be gathered together to one place, and let the dry land appear.”",
        source: {
          reference: "Genesis 1:9",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 9,
        },
      },
      {
        id: "day-3-q2",
        prompt: "What does God name the dry land and the gathered waters?",
        options: [
          "“Ground” and “rivers”",
          "“Field” and “deep”",
          "“Earth” and “seas”",
        ],
        answerIndex: 2,
        explanation:
          "“God called the dry land ‘earth’, and the gathering together of the waters he called ‘seas’.”",
        source: {
          reference: "Genesis 1:10",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 10,
        },
      },
      {
        id: "day-3-q3",
        prompt: "What is the earth told to yield?",
        options: [
          "Grass, herbs yielding seeds, and fruit trees",
          "Livestock and creeping things",
          "Great sea creatures and winged birds",
        ],
        answerIndex: 0,
        explanation:
          "“Let the earth yield grass, herbs yielding seeds, and fruit trees bearing fruit after their kind.” Animals come on days five and six.",
        source: {
          reference: "Genesis 1:11",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 11,
        },
      },
      {
        id: "day-3-q4",
        prompt: "What do the fruit trees carry inside their fruit?",
        options: ["Water", "Their seeds", "Their roots"],
        answerIndex: 1,
        explanation:
          "The trees bear “fruit, with their seeds in it, after their kind” — each one already carrying the next generation.",
        source: {
          reference: "Genesis 1:12",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 12,
        },
      },
      {
        id: "day-3-q5",
        prompt: "Which phrase repeats over the plants of the third day?",
        options: [
          "“In our image”",
          "“Be fruitful and multiply”",
          "“After their kind”",
        ],
        answerIndex: 2,
        explanation:
          "“After their kind” marks the plants. “Be fruitful and multiply” is said to the creatures, and “in our image” only of humankind.",
        source: {
          reference: "Genesis 1:12",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 12,
        },
      },
      {
        id: "day-3-q6",
        prompt: "How many times does God call something good on this day?",
        options: ["Twice", "Once", "Not at all"],
        answerIndex: 0,
        explanation:
          "The third day is the only one with two: after the seas and land, and again after the plants.",
        source: {
          reference: "Genesis 1:10",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 10,
        },
      },
      {
        id: "day-3-q7",
        prompt: "Which day closes with the land dressed in growing things?",
        options: ["A second day", "A third day", "A fourth day"],
        answerIndex: 1,
        explanation:
          "“There was evening and there was morning, a third day.” The dividing work is finished; filling begins.",
        source: {
          reference: "Genesis 1:13",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 13,
        },
      },
    ],
  },
  {
    id: "day-4",
    day: 4,
    title: "Lights in the Expanse",
    summary: "Two great lights, and the stars, set to mark time over the earth.",
    signature: "light",
    source: {
      reference: "Genesis 1:14–19",
      bookSlug: "genesis",
      chapter: 1,
      verseStart: 14,
      verseEnd: 19,
    },
    questions: [
      {
        id: "day-4-q1",
        prompt: "Where are the lights placed?",
        options: [
          "On the mountains",
          "In the expanse of the sky",
          "Under the seas",
        ],
        answerIndex: 1,
        explanation:
          "“Let there be lights in the expanse of the sky” — set in the space opened on the second day.",
        source: {
          reference: "Genesis 1:14",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 14,
        },
      },
      {
        id: "day-4-q2",
        prompt: "What are the lights given to mark?",
        options: [
          "Signs, seasons, days, and years",
          "Harvests and famines",
          "Births and journeys",
        ],
        answerIndex: 0,
        explanation:
          "“Let them be for signs to mark seasons, days, and years.” The lights are the world’s first calendar.",
        source: {
          reference: "Genesis 1:14",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 14,
        },
      },
      {
        id: "day-4-q3",
        prompt: "How does the passage describe the two great lights?",
        options: [
          "The near light and the far light",
          "The warm light and the cold light",
          "The greater light and the lesser light",
        ],
        answerIndex: 2,
        explanation:
          "“The greater light to rule the day, and the lesser light to rule the night.” Genesis 1 never gives them names.",
        source: {
          reference: "Genesis 1:16",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 16,
        },
      },
      {
        id: "day-4-q4",
        prompt: "What else does verse 16 say God made?",
        options: ["The stars", "The clouds", "The winds"],
        answerIndex: 0,
        explanation:
          "“He also made the stars” — added in a single short phrase after the two great lights.",
        source: {
          reference: "Genesis 1:16",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 16,
        },
      },
      {
        id: "day-4-q5",
        prompt: "What do the lights do for the earth?",
        options: [
          "Warm the seas",
          "Give light on the earth",
          "Water the ground",
        ],
        answerIndex: 1,
        explanation:
          "“God set them in the expanse of the sky to give light to the earth.” Their work is for the world below them.",
        source: {
          reference: "Genesis 1:17",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 17,
        },
      },
      {
        id: "day-4-q6",
        prompt:
          "Which day-one act do the lights of day four take up again?",
        options: [
          "Gathering the waters",
          "Naming the seas",
          "Dividing the light from the darkness",
        ],
        answerIndex: 2,
        explanation:
          "The lights “divide the light from the darkness” — the fourth day fills the space the first day opened.",
        source: {
          reference: "Genesis 1:18",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 18,
        },
      },
      {
        id: "day-4-q7",
        prompt: "Which day closes with the sky full of lights?",
        options: ["A fourth day", "A fifth day", "A third day"],
        answerIndex: 0,
        explanation:
          "“There was evening and there was morning, a fourth day.” Days four, five, and six fill days one, two, and three.",
        source: {
          reference: "Genesis 1:19",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 19,
        },
      },
    ],
  },
  {
    id: "day-5",
    day: 5,
    title: "Waters and Wings",
    summary: "The seas swarm and the sky fills, and the first blessing is given.",
    signature: "wing",
    source: {
      reference: "Genesis 1:20–23",
      bookSlug: "genesis",
      chapter: 1,
      verseStart: 20,
      verseEnd: 23,
    },
    questions: [
      {
        id: "day-5-q1",
        prompt: "What are the waters told to do?",
        options: [
          "Gather to one place",
          "Abound with living creatures",
          "Cover the dry land",
        ],
        answerIndex: 1,
        explanation:
          "“Let the waters abound with living creatures.” Gathering the waters was the third day’s work.",
        source: {
          reference: "Genesis 1:20",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 20,
        },
      },
      {
        id: "day-5-q2",
        prompt: "Where are the birds told to fly?",
        options: [
          "Above the earth in the open expanse of the sky",
          "Over the mountains only",
          "Between the two great lights",
        ],
        answerIndex: 0,
        explanation:
          "“Let birds fly above the earth in the open expanse of the sky” — the same expanse named “sky” on the second day.",
        source: {
          reference: "Genesis 1:20",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 20,
        },
      },
      {
        id: "day-5-q3",
        prompt: "Which creatures does verse 21 name first?",
        options: [
          "The winged birds",
          "The creeping things",
          "The large sea creatures",
        ],
        answerIndex: 2,
        explanation:
          "“God created the large sea creatures and every living creature that moves, with which the waters swarmed.”",
        source: {
          reference: "Genesis 1:21",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 21,
        },
      },
      {
        id: "day-5-q4",
        prompt: "What happens on this day that has not happened before?",
        options: [
          "God blesses what he has made",
          "God names what he has made",
          "God divides what he has made",
        ],
        answerIndex: 0,
        explanation:
          "“God blessed them, saying, ‘Be fruitful, and multiply.’” Naming and dividing filled the earlier days; blessing begins here.",
        source: {
          reference: "Genesis 1:22",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 22,
        },
      },
      {
        id: "day-5-q5",
        prompt: "What does the blessing tell the creatures to do?",
        options: [
          "Rest on the seventh day",
          "Be fruitful, multiply, and fill",
          "Keep to their own kind",
        ],
        answerIndex: 1,
        explanation:
          "“Be fruitful, and multiply, and fill the waters in the seas, and let birds multiply on the earth.”",
        source: {
          reference: "Genesis 1:22",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 22,
        },
      },
      {
        id: "day-5-q6",
        prompt: "Which earlier day does the fifth day fill?",
        options: [
          "The first day, of light",
          "The third day, of dry land",
          "The second day, of sky and sea",
        ],
        answerIndex: 2,
        explanation:
          "Day two opened sky and sea; day five fills both with birds and swarming creatures.",
        source: {
          reference: "Genesis 1:20–23",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 20,
          verseEnd: 23,
        },
      },
      {
        id: "day-5-q7",
        prompt: "How does the fifth day end?",
        options: [
          "“There was evening and there was morning, a fifth day”",
          "“And God rested from all his work”",
          "“And it was very good”",
        ],
        answerIndex: 0,
        explanation:
          "The refrain holds. Resting belongs to the seventh day, and “very good” to the sixth.",
        source: {
          reference: "Genesis 1:23",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 23,
        },
      },
    ],
  },
  {
    id: "day-6",
    day: 6,
    title: "Living Things and Likeness",
    summary:
      "The land brings forth its creatures, and humankind is made and blessed.",
    signature: "seed",
    source: {
      reference: "Genesis 1:24–31",
      bookSlug: "genesis",
      chapter: 1,
      verseStart: 24,
      verseEnd: 31,
    },
    questions: [
      {
        id: "day-6-q1",
        prompt: "What is the earth told to produce?",
        options: [
          "Grass, herbs, and fruit trees",
          "Living creatures after their kind",
          "Lights for signs and seasons",
        ],
        answerIndex: 1,
        explanation:
          "“Let the earth produce living creatures after their kind, livestock, creeping things, and animals of the earth.” Plants came on the third day.",
        source: {
          reference: "Genesis 1:24",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 24,
        },
      },
      {
        id: "day-6-q2",
        prompt: "How does the passage describe the making of humankind?",
        options: [
          "“Out of the dust of the seas”",
          "“After the kind of the animals”",
          "“In our image, after our likeness”",
        ],
        answerIndex: 2,
        explanation:
          "“Let’s make man in our image, after our likeness.” It is the one thing in the chapter said to be made this way.",
        source: {
          reference: "Genesis 1:26",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 26,
        },
      },
      {
        id: "day-6-q3",
        prompt: "Whom does verse 27 say was created in God’s image?",
        options: [
          "Male and female",
          "Only the firstborn",
          "Every living creature",
        ],
        answerIndex: 0,
        explanation:
          "“In God’s image he created him; male and female he created them.”",
        source: {
          reference: "Genesis 1:27",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 27,
        },
      },
      {
        id: "day-6-q4",
        prompt: "What is given to humankind for food?",
        options: [
          "The fish of the sea",
          "Every seed-bearing herb and fruit tree",
          "The livestock of the field",
        ],
        answerIndex: 1,
        explanation:
          "“I have given you every herb yielding seed… and every tree, which bears fruit yielding seed. It will be your food.”",
        source: {
          reference: "Genesis 1:29",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 29,
        },
      },
      {
        id: "day-6-q5",
        prompt: "What is given to the animals and birds for food?",
        options: [
          "Nothing is said about them",
          "The fruit of the trees only",
          "Every green herb",
        ],
        answerIndex: 2,
        explanation:
          "“To every animal of the earth, and to every bird of the sky… I have given every green herb for food.”",
        source: {
          reference: "Genesis 1:30",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 30,
        },
      },
      {
        id: "day-6-q6",
        prompt: "What does God say when looking at everything he had made?",
        options: [
          "“It was very good”",
          "“It was finished”",
          "“It was enough”",
        ],
        answerIndex: 0,
        explanation:
          "“God saw everything that he had made, and, behold, it was very good.” Earlier days are called good; only the whole is called very good.",
        source: {
          reference: "Genesis 1:31",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 31,
        },
      },
      {
        id: "day-6-q7",
        prompt: "What are the people blessed and told to do?",
        options: [
          "Keep the seventh day holy",
          "Be fruitful, multiply, and fill the earth",
          "Name every living creature",
        ],
        answerIndex: 1,
        explanation:
          "“Be fruitful, multiply, fill the earth, and subdue it.” The seventh day is blessed in the next chapter; naming the animals comes in Genesis 2.",
        source: {
          reference: "Genesis 1:28",
          bookSlug: "genesis",
          chapter: 1,
          verseStart: 28,
        },
      },
    ],
  },
  {
    id: "day-7",
    day: 7,
    title: "The Day That Was Blessed",
    summary: "The work is finished, and rest itself is set apart and made holy.",
    signature: "waters",
    source: {
      reference: "Genesis 2:1–3",
      bookSlug: "genesis",
      chapter: 2,
      verseStart: 1,
      verseEnd: 3,
    },
    questions: [
      {
        id: "day-7-q1",
        prompt: "How does Genesis 2 open?",
        options: [
          "“In the beginning, God created…”",
          "“The heavens, the earth, and all their vast array were finished”",
          "“This is the history of the generations”",
        ],
        answerIndex: 1,
        explanation:
          "The work of the six days is gathered into one sentence before the seventh day is described.",
        source: {
          reference: "Genesis 2:1",
          bookSlug: "genesis",
          chapter: 2,
          verseStart: 1,
        },
      },
      {
        id: "day-7-q2",
        prompt: "What does God do on the seventh day?",
        options: [
          "Rests from all his work",
          "Divides the waters again",
          "Plants a garden in Eden",
        ],
        answerIndex: 0,
        explanation:
          "“He rested on the seventh day from all his work which he had done.” The garden is planted later, in Genesis 2.",
        source: {
          reference: "Genesis 2:2",
          bookSlug: "genesis",
          chapter: 2,
          verseStart: 2,
        },
      },
      {
        id: "day-7-q3",
        prompt: "What two things does God do to the seventh day itself?",
        options: [
          "Names it and numbers it",
          "Divides it and fills it",
          "Blesses it and makes it holy",
        ],
        answerIndex: 2,
        explanation:
          "“God blessed the seventh day, and made it holy.” A day — not a place or a creature — is what gets set apart here.",
        source: {
          reference: "Genesis 2:3",
          bookSlug: "genesis",
          chapter: 2,
          verseStart: 3,
        },
      },
      {
        id: "day-7-q4",
        prompt: "Why does the passage say the day was made holy?",
        options: [
          "Because God rested in it from all his work",
          "Because the lights marked it",
          "Because the people asked for it",
        ],
        answerIndex: 0,
        explanation:
          "“Because he rested in it from all his work of creation which he had done.”",
        source: {
          reference: "Genesis 2:3",
          bookSlug: "genesis",
          chapter: 2,
          verseStart: 3,
        },
      },
      {
        id: "day-7-q5",
        prompt: "What is missing from the seventh day that ends every other one?",
        options: [
          "A blessing",
          "The evening-and-morning refrain",
          "The words “it was good”",
        ],
        answerIndex: 1,
        explanation:
          "Days one through six each close with “There was evening and there was morning.” The seventh day is given no such ending.",
        source: {
          reference: "Genesis 2:1–3",
          bookSlug: "genesis",
          chapter: 2,
          verseStart: 1,
          verseEnd: 3,
        },
      },
      {
        id: "day-7-q6",
        prompt: "Which day of the account is blessed and set apart?",
        options: ["The first", "The sixth", "The seventh"],
        answerIndex: 2,
        explanation:
          "The sixth day ends with “very good”; the seventh is the one blessed and made holy.",
        source: {
          reference: "Genesis 2:3",
          bookSlug: "genesis",
          chapter: 2,
          verseStart: 3,
        },
      },
      {
        id: "day-7-q7",
        prompt: "Taken together, what shape does the week in Genesis 1 have?",
        options: [
          "Six days of work, then a day set apart",
          "Seven days of unbroken work",
          "One day of work and six of rest",
        ],
        answerIndex: 0,
        explanation:
          "Three days divide, three days fill, and the seventh is blessed — the pattern the rest of Scripture keeps returning to.",
        source: {
          reference: "Genesis 2:1–3",
          bookSlug: "genesis",
          chapter: 2,
          verseStart: 1,
          verseEnd: 3,
        },
      },
    ],
  },
] as const satisfies readonly SevenDaysChapter[];

export const SEVEN_DAYS_CHAPTER_COUNT = SEVEN_DAYS_CHAPTERS.length;
export const SEVEN_DAYS_LEVELS_PER_CHAPTER = 7;
export const SEVEN_DAYS_TOTAL_LEVELS =
  SEVEN_DAYS_CHAPTER_COUNT * SEVEN_DAYS_LEVELS_PER_CHAPTER;
