import type {
  GuidedContentReview,
  GuidedPractice,
  PilgrimageDefinition,
} from "@/lib/guided/types";
import { dateKeyOrdinal } from "@/lib/utils/dates";

// This shared stamp records the required adversarial editorial pass.
const REVIEW: GuidedContentReview = {
  status: "reviewed",
  reviewedAt: "2026-07-29",
  lenses: ["safety", "tone", "theology"],
  scriptureSource: "bundled_web",
};

const WEB = "World English Bible (WEB)" as const;

/** Seven reviewed practices yield one free guide each local day. */
export const dailyGuidedScripture: readonly GuidedPractice[] = [
  {
    id: "guide.daily.green-pastures.v1",
    title: "Beside still waters",
    summary: "Receive the care of the Shepherd before carrying the day.",
    durationMinutes: 6,
    access: "free",
    scripture: {
      bookSlug: "psalms",
      bookName: "Psalms",
      chapter: 23,
      verseStart: 1,
      verseEnd: 3,
      reference: "Psalms 23:1–3",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "Yahweh is my shepherd: I shall lack nothing.",
        "He makes me lie down in green pastures. He leads me beside still waters.",
        "He restores my soul. He guides me in the paths of righteousness for his name’s sake.",
      ],
    },
    arrive:
      "Set both feet down if that is comfortable. Let one slow breath mark the beginning. Nothing needs to be proved here.",
    notice:
      "Read the passage once more. Notice which image—shepherd, pasture, water, restoration, or path—holds your attention.",
    reflect:
      "Where might you need to receive care instead of carrying everything alone?",
    respond:
      "Choose one ordinary moment today to slow down and receive what is already being given.",
    prayer:
      "God, shepherd me with patience. Restore what is tired in me, and guide my next step.",
    reflectionPromptId: "r06",
    prayerPromptId: "p11",
    questSlug: "one-quiet-cup",
    review: REVIEW,
  },
  {
    id: "guide.daily-new-every-morning.v1",
    title: "New every morning",
    summary: "Begin again in the steady compassion of God.",
    durationMinutes: 5,
    access: "free",
    scripture: {
      bookSlug: "lamentations",
      bookName: "Lamentations",
      chapter: 3,
      verseStart: 22,
      verseEnd: 23,
      reference: "Lamentations 3:22–23",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "It is because of Yahweh’s loving kindnesses that we are not consumed, because his compassion doesn’t fail.",
        "They are new every morning. Great is your faithfulness.",
      ],
    },
    arrive:
      "Open your hands for one breath. You may begin from the day you actually have, not the day you expected.",
    notice:
      "Notice that the passage speaks of compassion in the middle of lament. Hope does not require pretending that pain is absent.",
    reflect:
      "What would a gentle beginning look like in the part of life that feels worn?",
    respond:
      "Offer one small mercy today—to yourself or another person—without asking it to fix everything.",
    prayer:
      "Faithful God, meet me in this beginning. Help me receive and carry your compassion today.",
    reflectionPromptId: "r32",
    prayerPromptId: "p08",
    questSlug: "three-small-thanks",
    review: REVIEW,
  },
  {
    id: "guide.daily-renewed-strength.v1",
    title: "Strength for the next step",
    summary: "Wait without shame and receive enough strength for today.",
    durationMinutes: 5,
    access: "free",
    scripture: {
      bookSlug: "isaiah",
      bookName: "Isaiah",
      chapter: 40,
      verseStart: 31,
      verseEnd: 31,
      reference: "Isaiah 40:31",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "but those who wait for Yahweh will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.",
      ],
    },
    arrive:
      "Let your shoulders soften. Waiting here is not wasted time. Take one unhurried breath.",
    notice:
      "The verse names soaring, running, and walking. Notice that ordinary walking also belongs to renewed strength.",
    reflect:
      "Where do you need enough strength for one step rather than strength for the whole road?",
    respond:
      "Name the next honest step. Make it smaller if that would help you begin with care.",
    prayer:
      "God, renew me without hurry. Give me enough strength and wisdom for the step in front of me.",
    reflectionPromptId: "r27",
    prayerPromptId: "p12",
    questSlug: "begin-what-you-have-put-off",
    review: REVIEW,
  },
  {
    id: "guide.daily-todays-care.v1",
    title: "Today’s care",
    summary: "Set tomorrow down long enough to seek God in this day.",
    durationMinutes: 7,
    access: "free",
    scripture: {
      bookSlug: "matthew",
      bookName: "Matthew",
      chapter: 6,
      verseStart: 31,
      verseEnd: 34,
      reference: "Matthew 6:31–34",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "“Therefore don’t be anxious, saying, ‘What will we eat?’, ‘What will we drink?’ or, ‘With what will we be clothed?’",
        "For the Gentiles seek after all these things; for your heavenly Father knows that you need all these things.",
        "But seek first God’s Kingdom, and his righteousness; and all these things will be given to you as well.",
        "Therefore don’t be anxious for tomorrow, for tomorrow will be anxious for itself. Each day’s own evil is sufficient.",
      ],
    },
    arrive:
      "Name, without judgment, one concern asking for your attention. Breathe once before trying to solve it.",
    notice:
      "Jesus does not deny that people have real needs. Notice the movement from anxious grasping toward today’s faithful attention.",
    reflect:
      "Which concern belongs to today, and which one can wait without being ignored?",
    respond:
      "Write down tomorrow’s concern, then choose one grounded action that belongs to today.",
    prayer:
      "Father, you know what I need. Give me wisdom for today and help me entrust tomorrow to you.",
    reflectionPromptId: "r25",
    prayerPromptId: "p03",
    questSlug: "name-what-you-are-carrying",
    review: REVIEW,
  },
  {
    id: "guide.daily-not-forgotten.v1",
    title: "Not forgotten",
    summary: "Rest for a moment in God’s attentive care.",
    durationMinutes: 5,
    access: "free",
    scripture: {
      bookSlug: "luke",
      bookName: "Luke",
      chapter: 12,
      verseStart: 6,
      verseEnd: 7,
      reference: "Luke 12:6–7",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "“Aren’t five sparrows sold for two assaria coins? Not one of them is forgotten by God.",
        "But the very hairs of your head are all counted. Therefore don’t be afraid. You are of more value than many sparrows.",
      ],
    },
    arrive:
      "Look at one small thing near you. Let it remind you that attention can be quiet and particular.",
    notice:
      "Stay with the words “not one of them is forgotten.” Let the sparrows remain small; their smallness is part of Jesus’ point.",
    reflect:
      "What part of your life feels easy to overlook or forget?",
    respond:
      "Give patient attention to one person or task that might otherwise pass unnoticed today.",
    prayer:
      "God who notices every sparrow, hold what feels small or forgotten in me. Make me attentive in love.",
    reflectionPromptId: "r19",
    prayerPromptId: "p15",
    questSlug: "give-your-full-attention",
    review: REVIEW,
  },
  {
    id: "guide.daily-held-in-love.v1",
    title: "Held in love",
    summary: "Remember the breadth of God’s love in Christ.",
    durationMinutes: 6,
    access: "free",
    scripture: {
      bookSlug: "romans",
      bookName: "Romans",
      chapter: 8,
      verseStart: 38,
      verseEnd: 39,
      reference: "Romans 8:38–39",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "For I am persuaded that neither death, nor life, nor angels, nor principalities, nor things present, nor things to come, nor powers,",
        "nor height, nor depth, nor any other created thing will be able to separate us from God’s love which is in Christ Jesus our Lord.",
      ],
    },
    arrive:
      "Let your breathing be natural. You do not need to create God’s love before you can rest within it.",
    notice:
      "Paul stretches language across life and death, present and future, height and depth. Notice how complete the sweep is.",
    reflect:
      "Which distance or fear is hardest for you to imagine held within God’s love?",
    respond:
      "Speak one gentle, truthful sentence to yourself or someone else who needs to remember they are not alone.",
    prayer:
      "Jesus, hold me in the love that nothing can separate from me. Help me carry that assurance gently to another.",
    reflectionPromptId: "r08",
    prayerPromptId: "p32",
    questSlug: "speak-gently-to-yourself",
    review: REVIEW,
  },
  {
    id: "guide.daily-prepared-good.v1",
    title: "Made for good",
    summary: "Receive one good work as a path, not a performance.",
    durationMinutes: 5,
    access: "free",
    scripture: {
      bookSlug: "ephesians",
      bookName: "Ephesians",
      chapter: 2,
      verseStart: 10,
      verseEnd: 10,
      reference: "Ephesians 2:10",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "For we are his workmanship, created in Christ Jesus for good works, which God prepared before that we would walk in them.",
      ],
    },
    arrive:
      "Pause before thinking about what you must accomplish. Receive yourself first as God’s workmanship.",
    notice:
      "Notice the order: God’s workmanship comes before good works. The work is a path to walk, not a price for belonging.",
    reflect:
      "What good action feels quietly prepared for you today?",
    respond:
      "Choose one concrete act of care that fits your real capacity. Small faithfulness is still faithfulness.",
    prayer:
      "God, thank you for making me with care. Lead me into the good I can faithfully do today.",
    reflectionPromptId: "r15",
    prayerPromptId: "p23",
    questSlug: "serve-without-being-seen",
    review: REVIEW,
  },
] as const;

const learningToRemainDays: readonly GuidedPractice[] = [
  {
    id: "pilgrimage.learning-to-remain.day-01.v1",
    title: "Be still",
    summary: "Begin by making room for God’s presence.",
    durationMinutes: 7,
    access: "free",
    scripture: {
      bookSlug: "psalms",
      bookName: "Psalms",
      chapter: 46,
      verseStart: 10,
      verseEnd: 10,
      reference: "Psalms 46:10",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "“Be still, and know that I am God. I will be exalted among the nations. I will be exalted in the earth.”",
      ],
    },
    arrive:
      "Choose a posture you can sustain. Let the room be as it is. Take two quiet breaths without forcing them.",
    notice:
      "The verse does not say that stillness makes God present. Notice the invitation to recognize the God who already is.",
    reflect:
      "What becomes noticeable when you stop trying to fill the silence?",
    respond:
      "Keep five minutes of unfilled quiet today. If silence is difficult, return gently to the words “You are God.”",
    prayer:
      "God, meet me in quiet and in noise. Teach me to recognize your presence without striving.",
    reflectionPromptId: "r09",
    prayerPromptId: "p16",
    questSlug: "five-minutes-of-stillness",
    review: REVIEW,
  },
  {
    id: "pilgrimage.learning-to-remain.day-02.v1",
    title: "Receive rest",
    summary: "Come to Jesus without hiding what is heavy.",
    durationMinutes: 8,
    access: "free",
    scripture: {
      bookSlug: "matthew",
      bookName: "Matthew",
      chapter: 11,
      verseStart: 28,
      verseEnd: 30,
      reference: "Matthew 11:28–30",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "“Come to me, all you who labor and are heavily burdened, and I will give you rest.",
        "Take my yoke upon you, and learn from me, for I am gentle and humble in heart; and you will find rest for your souls.",
        "For my yoke is easy, and my burden is light.”",
      ],
    },
    arrive:
      "Notice where your body is holding effort. Soften what can soften; do not force what cannot.",
    notice:
      "Jesus describes himself as gentle and humble in heart. Let that description shape how you hear his invitation.",
    reflect:
      "What burden do you want to name honestly in the presence of gentleness?",
    respond:
      "Set down one nonessential demand for today, or ask for practical help if that is available and safe.",
    prayer:
      "Gentle Jesus, I bring you what is heavy. Teach me the unforced way of walking with you.",
    reflectionPromptId: "r25",
    prayerPromptId: "p11",
    questSlug: "name-what-you-are-carrying",
    review: REVIEW,
  },
  {
    id: "pilgrimage.learning-to-remain.day-03.v1",
    title: "Remain",
    summary: "Let connection with Christ come before visible fruit.",
    durationMinutes: 8,
    access: "free",
    scripture: {
      bookSlug: "john",
      bookName: "John",
      chapter: 15,
      verseStart: 4,
      verseEnd: 5,
      reference: "John 15:4–5",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "Remain in me, and I in you. As the branch can’t bear fruit by itself unless it remains in the vine, so neither can you, unless you remain in me.",
        "I am the vine. You are the branches. He who remains in me and I in him bears much fruit, for apart from me you can do nothing.",
      ],
    },
    arrive:
      "Picture a branch held by the vine. Let the image replace any urge to manufacture a result during this time.",
    notice:
      "The branch’s first work is remaining. Fruit comes from living connection, not from the branch proving itself.",
    reflect:
      "Which practice helps you remain close to Christ without turning closeness into achievement?",
    respond:
      "Return to one simple practice today: a short prayer, one paragraph of Scripture, or a quiet walk.",
    prayer:
      "Christ, keep me close to you. Let any good fruit grow from your life in me, not from anxious striving.",
    reflectionPromptId: "r08",
    prayerPromptId: "p17",
    questSlug: "the-lords-prayer-slowly",
    review: REVIEW,
  },
  {
    id: "pilgrimage.learning-to-remain.day-04.v1",
    title: "Choose the good part",
    summary: "Notice distraction without condemning yourself.",
    durationMinutes: 10,
    access: "free",
    scripture: {
      bookSlug: "luke",
      bookName: "Luke",
      chapter: 10,
      verseStart: 38,
      verseEnd: 42,
      reference: "Luke 10:38–42",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "As they went on their way, he entered into a certain village, and a certain woman named Martha received him into her house.",
        "She had a sister called Mary, who also sat at Jesus’ feet, and heard his word.",
        "But Martha was distracted with much serving, and she came up to him, and said, “Lord, don’t you care that my sister left me to serve alone? Ask her therefore to help me.”",
        "Jesus answered her, “Martha, Martha, you are anxious and troubled about many things,",
        "but one thing is needed. Mary has chosen the good part, which will not be taken away from her.”",
      ],
    },
    arrive:
      "Name the distractions present without treating them as enemies. Imagine setting each one nearby for a few minutes.",
    notice:
      "Jesus names Martha twice. Hear care in the repetition before hearing correction. Service is not mocked; anxious distraction is noticed.",
    reflect:
      "What good responsibility has become tangled with hurry or resentment?",
    respond:
      "Do one necessary task with full attention, or sit for five minutes before returning to it.",
    prayer:
      "Jesus, meet me among many things. Help me choose what is needed with attention and grace.",
    reflectionPromptId: "r02",
    prayerPromptId: "p18",
    questSlug: "give-your-full-attention",
    review: REVIEW,
  },
  {
    id: "pilgrimage.learning-to-remain.day-05.v1",
    title: "Bring everything",
    summary: "Let prayer hold both need and thanksgiving.",
    durationMinutes: 8,
    access: "free",
    scripture: {
      bookSlug: "philippians",
      bookName: "Philippians",
      chapter: 4,
      verseStart: 6,
      verseEnd: 7,
      reference: "Philippians 4:6–7",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.",
        "And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.",
      ],
    },
    arrive:
      "Let one worry be present without judging yourself for having it. This practice does not replace medical or professional care.",
    notice:
      "The passage makes room for requests, not denial. Notice that peace is described as God’s gift, not a feeling you must produce.",
    reflect:
      "What request and what small thanksgiving can you hold together today?",
    respond:
      "Write one honest request and one honest gratitude. Keep both sentences simple.",
    prayer:
      "God, I bring you what I need and what I can thank you for. Guard my heart as I take the next wise step.",
    reflectionPromptId: "r10",
    prayerPromptId: "p10",
    questSlug: "three-small-thanks",
    review: REVIEW,
  },
  {
    id: "pilgrimage.learning-to-remain.day-06.v1",
    title: "Put on compassion",
    summary: "Practice love with humility, patience, and wise boundaries.",
    durationMinutes: 9,
    access: "free",
    scripture: {
      bookSlug: "colossians",
      bookName: "Colossians",
      chapter: 3,
      verseStart: 12,
      verseEnd: 14,
      reference: "Colossians 3:12–14",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "Put on therefore, as God’s chosen ones, holy and beloved, a heart of compassion, kindness, lowliness, humility, and perseverance;",
        "bearing with one another, and forgiving each other, if any man has a complaint against any; even as Christ forgave you, so you also do.",
        "Above all these things, walk in love, which is the bond of perfection.",
      ],
    },
    arrive:
      "Receive the words “holy and beloved” before considering what love asks of you.",
    notice:
      "Compassion, kindness, humility, patience, forgiveness, and love belong together. Forgiveness does not require unsafe contact, restored access, or forgotten boundaries.",
    reflect:
      "Which quality could you “put on” in one safe relationship or ordinary encounter today?",
    respond:
      "Choose one bounded act of kindness. If harm is involved, keep needed distance and practice mercy without reopening contact.",
    prayer:
      "God, clothe me in compassion and wisdom. Teach me to love with humility, patience, and safe boundaries.",
    reflectionPromptId: "r15",
    prayerPromptId: "p31",
    questSlug: "speak-gently-to-yourself",
    review: REVIEW,
  },
  {
    id: "pilgrimage.learning-to-remain.day-07.v1",
    title: "Walk humbly",
    summary: "Carry prayer into justice, mercy, and an ordinary next step.",
    durationMinutes: 9,
    access: "free",
    scripture: {
      bookSlug: "micah",
      bookName: "Micah",
      chapter: 6,
      verseStart: 8,
      verseEnd: 8,
      reference: "Micah 6:8",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "He has shown you, O man, what is good. What does Yahweh require of you, but to act justly, to love mercy, and to walk humbly with your God?",
      ],
    },
    arrive:
      "Remember the path behind you without grading it. Returning is enough. Let one breath make room for the road ahead.",
    notice:
      "The verse joins justice, mercy, humility, and companionship with God. None is offered as a private performance.",
    reflect:
      "Where could justice, mercy, and humility meet in one realistic choice?",
    respond:
      "Choose one action within your capacity: listen carefully, repair a small wrong, support a fair need, or serve without taking over.",
    prayer:
      "God of justice and mercy, keep me near you as I walk. Make my next step humble, loving, and true.",
    reflectionPromptId: "r03",
    prayerPromptId: "p23",
    questSlug: "make-way-for-a-stranger",
    review: REVIEW,
  },
] as const;

const wayOfPeaceDays: readonly GuidedPractice[] = [
  {
    id: "pilgrimage.way-of-peace.day-01.v1",
    title: "A steadfast mind",
    summary: "Begin peace by returning attention to the everlasting Rock.",
    durationMinutes: 9,
    access: "plus",
    scripture: {
      bookSlug: "isaiah",
      bookName: "Isaiah",
      chapter: 26,
      verseStart: 3,
      verseEnd: 4,
      reference: "Isaiah 26:3–4",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "You will keep whoever’s mind is steadfast in perfect peace, because he trusts in you.",
        "Trust in Yahweh forever; for in Yah, Yahweh, is an everlasting Rock.",
      ],
    },
    arrive:
      "Notice where your attention has been pulled. Return without scolding yourself, as often as needed.",
    notice:
      "Steadfastness here is tied to trust in God’s steadiness. Peace is not produced by perfect concentration.",
    reflect:
      "What helps your attention return to God when it has scattered?",
    respond:
      "Choose a short returning phrase from the passage and carry it through one transition today.",
    prayer:
      "Everlasting God, steady my attention in your faithfulness. Let trust make room for peace.",
    reflectionPromptId: "r08",
    prayerPromptId: "p17",
    questSlug: "carry-a-verse-through-your-afternoon",
    review: REVIEW,
  },
  {
    id: "pilgrimage.way-of-peace.day-02.v1",
    title: "Make peace",
    summary: "Receive peacemaking as courageous, patient work.",
    durationMinutes: 8,
    access: "plus",
    scripture: {
      bookSlug: "matthew",
      bookName: "Matthew",
      chapter: 5,
      verseStart: 9,
      verseEnd: 9,
      reference: "Matthew 5:9",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "Blessed are the peacemakers, for they shall be called children of God.",
      ],
    },
    arrive:
      "Let peace mean more than keeping everyone comfortable. Breathe before considering what honest peacemaking might require.",
    notice:
      "Jesus blesses peacemakers—people who participate in peace—not people who merely avoid tension.",
    reflect:
      "Where might peace require truth, patient listening, or a boundary rather than silence?",
    respond:
      "Take one low-risk step toward peace. Do not enter an unsafe conversation or contact someone who has harmed you.",
    prayer:
      "Jesus, make me truthful and gentle. Give me courage for safe, patient peacemaking.",
    reflectionPromptId: "r27",
    prayerPromptId: "p22",
    questSlug: "prepare-for-a-repairing-conversation",
    review: REVIEW,
  },
  {
    id: "pilgrimage.way-of-peace.day-03.v1",
    title: "As much as it is up to you",
    summary: "Practice peace without taking responsibility for another’s choices.",
    durationMinutes: 10,
    access: "plus",
    scripture: {
      bookSlug: "romans",
      bookName: "Romans",
      chapter: 12,
      verseStart: 17,
      verseEnd: 18,
      reference: "Romans 12:17–18",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "Repay no one evil for evil. Respect what is honorable in the sight of all men.",
        "If it is possible, as much as it is up to you, be at peace with all men.",
      ],
    },
    arrive:
      "Hear the limits in the words “if it is possible” and “as much as it is up to you.” Let those limits be a kindness.",
    notice:
      "Paul calls for honorable action without claiming you can control another person or make every relationship safe.",
    reflect:
      "What belongs to your responsibility, and what belongs to someone else?",
    respond:
      "Write two short lists: “mine to carry” and “not mine to control.” Honor protective boundaries.",
    prayer:
      "God, show me the peace that is mine to practice and the outcomes that are not mine to control.",
    reflectionPromptId: "r27",
    prayerPromptId: "p12",
    questSlug: "open-your-hands",
    review: REVIEW,
  },
  {
    id: "pilgrimage.way-of-peace.day-04.v1",
    title: "Wisdom that is gentle",
    summary: "Let peace be shaped by mercy, honesty, and good fruit.",
    durationMinutes: 10,
    access: "plus",
    scripture: {
      bookSlug: "james",
      bookName: "James",
      chapter: 3,
      verseStart: 17,
      verseEnd: 18,
      reference: "James 3:17–18",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "But the wisdom that is from above is first pure, then peaceful, gentle, reasonable, full of mercy and good fruits, without partiality, and without hypocrisy.",
        "Now the fruit of righteousness is sown in peace by those who make peace.",
      ],
    },
    arrive:
      "Read the qualities slowly. Let none become a demand to perform. Receive them as a picture of wise love.",
    notice:
      "Peaceful wisdom is also pure, reasonable, merciful, fruitful, impartial, and sincere. Peace is not separated from truth.",
    reflect:
      "Which quality could help you discern a current choice?",
    respond:
      "Before one decision, ask whether the next step is honest, gentle, reasonable, and merciful.",
    prayer:
      "God of wisdom, form in me a peace that is honest and full of mercy. Let good fruit grow quietly.",
    reflectionPromptId: "r30",
    prayerPromptId: "p23",
    questSlug: "discern-a-decision-with-counsel",
    review: REVIEW,
  },
  {
    id: "pilgrimage.way-of-peace.day-05.v1",
    title: "Answer with blessing",
    summary: "Choose a non-retaliating response while preserving wise safety.",
    durationMinutes: 9,
    access: "plus",
    scripture: {
      bookSlug: "1-peter",
      bookName: "1 Peter",
      chapter: 3,
      verseStart: 8,
      verseEnd: 9,
      reference: "1 Peter 3:8–9",
      translationKey: "web",
      translationLabel: WEB,
      verses: [
        "Finally, all of you be like-minded, compassionate, loving as brothers, tenderhearted, courteous,",
        "not rendering evil for evil, or insult for insult; but instead blessing, knowing that you were called to this, that you may inherit a blessing.",
      ],
    },
    arrive:
      "Bring to mind an ordinary irritation, not an unsafe person or traumatic situation. Let this practice stay within your real capacity.",
    notice:
      "Compassion and courtesy frame the refusal to retaliate. Blessing does not require closeness, trust, or continued access.",
    reflect:
      "What response would refuse retaliation without denying truth or abandoning a needed boundary?",
    respond:
      "Rehearse one calm sentence, choose not to send a reactive message, or step away until you can respond wisely.",
    prayer:
      "God of peace, keep retaliation from ruling me. Give me compassion, truth, and the wisdom to keep safe boundaries.",
    reflectionPromptId: "r12",
    prayerPromptId: "p31",
    questSlug: "practice-community-conflict-with-boundaries",
    review: REVIEW,
  },
] as const;

/** Free essentials remain complete; Plus provides an additional curated path. */
export const pilgrimages: readonly PilgrimageDefinition[] = [
  {
    id: "pilgrimage.learning-to-remain.v1",
    slug: "learning-to-remain",
    title: "Learning to Remain",
    summary: "Seven gentle days of Scripture, quiet, and lived response.",
    description:
      "Practice stillness, receive rest, remain in Christ, and carry prayer into an ordinary faithful step. Continue whenever you are ready; days never expire.",
    access: "free",
    estimatedDays: 7,
    estimatedMinutesPerDay: 9,
    days: learningToRemainDays,
    review: REVIEW,
  },
  {
    id: "pilgrimage.way-of-peace.v1",
    slug: "way-of-peace",
    title: "The Way of Peace",
    summary: "Five guided practices for truthful, merciful peacemaking.",
    description:
      "Explore steadfast trust, peacemaking, responsibility, gentle wisdom, and non-retaliation. Every day preserves safety and wise boundaries.",
    access: "plus",
    estimatedDays: 5,
    estimatedMinutesPerDay: 10,
    days: wayOfPeaceDays,
    review: REVIEW,
  },
] as const;

export const pilgrimageBySlug = new Map(
  pilgrimages.map((pilgrimage) => [pilgrimage.slug, pilgrimage]),
);

/** Resolves only checked-in reviewed practices from a stable handoff id. */
export const guidedPracticeById = new Map<string, GuidedPractice>(
  [
    ...dailyGuidedScripture,
    ...pilgrimages.flatMap((pilgrimage) => pilgrimage.days),
  ].map((practice) => [practice.id, practice]),
);

/** Consecutive local dates traverse every reviewed guide once before repeating. */
export function guidedScriptureForDate(dateKey: string): GuidedPractice {
  const ordinal = dateKeyOrdinal(dateKey);
  return dailyGuidedScripture[
    ((ordinal % dailyGuidedScripture.length) + dailyGuidedScripture.length) %
      dailyGuidedScripture.length
  ];
}
