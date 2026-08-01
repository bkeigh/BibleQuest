import type { ScriptureSource } from "@/lib/games/types";

export interface SevenDaysVerse {
  readonly source: ScriptureSource;
  readonly text: string;
}

/**
 * Genesis 1:1 – 2:3, the whole of what this game retells.
 *
 * Bundled rather than fetched: it is thirty-four verses, the board needs one
 * under it on every level, and a card that has to wait on a request to show a
 * single line of Scripture will sometimes show nothing at all. Wording follows
 * the World English Bible, the edition BibleQuest bundles.
 */
function verse(
  chapter: number,
  verseNumber: number,
  text: string,
): SevenDaysVerse {
  return {
    source: {
      reference: `Genesis ${chapter}:${verseNumber}`,
      bookSlug: "genesis",
      chapter,
      verseStart: verseNumber,
    },
    text,
  };
}

export const SEVEN_DAYS_VERSES: readonly SevenDaysVerse[] = [
  verse(1, 1, "In the beginning, God created the heavens and the earth."),
  verse(
    1,
    2,
    "The earth was formless and empty. Darkness was on the surface of the deep and God’s Spirit was hovering over the surface of the waters.",
  ),
  verse(1, 3, "God said, “Let there be light,” and there was light."),
  verse(
    1,
    4,
    "God saw the light, and saw that it was good. God divided the light from the darkness.",
  ),
  verse(
    1,
    5,
    "God called the light “day”, and the darkness he called “night”. There was evening and there was morning, the first day.",
  ),
  verse(
    1,
    6,
    "God said, “Let there be an expanse in the middle of the waters, and let it divide the waters from the waters.”",
  ),
  verse(
    1,
    7,
    "God made the expanse, and divided the waters which were under the expanse from the waters which were above the expanse; and it was so.",
  ),
  verse(
    1,
    8,
    "God called the expanse “sky”. There was evening and there was morning, a second day.",
  ),
  verse(
    1,
    9,
    "God said, “Let the waters under the sky be gathered together to one place, and let the dry land appear;” and it was so.",
  ),
  verse(
    1,
    10,
    "God called the dry land “earth”, and the gathering together of the waters he called “seas”. God saw that it was good.",
  ),
  verse(
    1,
    11,
    "God said, “Let the earth yield grass, herbs yielding seeds, and fruit trees bearing fruit after their kind, with their seeds in it, on the earth;” and it was so.",
  ),
  verse(
    1,
    12,
    "The earth yielded grass, herbs yielding seed after their kind, and trees bearing fruit, with their seeds in it, after their kind; and God saw that it was good.",
  ),
  verse(1, 13, "There was evening and there was morning, a third day."),
  verse(
    1,
    14,
    "God said, “Let there be lights in the expanse of the sky to divide the day from the night; and let them be for signs to mark seasons, days, and years;",
  ),
  verse(
    1,
    15,
    "and let them be for lights in the expanse of the sky to give light on the earth;” and it was so.",
  ),
  verse(
    1,
    16,
    "God made the two great lights: the greater light to rule the day, and the lesser light to rule the night. He also made the stars.",
  ),
  verse(
    1,
    17,
    "God set them in the expanse of the sky to give light to the earth,",
  ),
  verse(
    1,
    18,
    "and to rule over the day and over the night, and to divide the light from the darkness. God saw that it was good.",
  ),
  verse(1, 19, "There was evening and there was morning, a fourth day."),
  verse(
    1,
    20,
    "God said, “Let the waters abound with living creatures, and let birds fly above the earth in the open expanse of the sky.”",
  ),
  verse(
    1,
    21,
    "God created the large sea creatures and every living creature that moves, with which the waters swarmed, after their kind, and every winged bird after its kind. God saw that it was good.",
  ),
  verse(
    1,
    22,
    "God blessed them, saying, “Be fruitful, and multiply, and fill the waters in the seas, and let birds multiply on the earth.”",
  ),
  verse(1, 23, "There was evening and there was morning, a fifth day."),
  verse(
    1,
    24,
    "God said, “Let the earth produce living creatures after their kind, livestock, creeping things, and animals of the earth after their kind;” and it was so.",
  ),
  verse(
    1,
    25,
    "God made the animals of the earth after their kind, and the livestock after their kind, and everything that creeps on the ground after its kind. God saw that it was good.",
  ),
  verse(
    1,
    26,
    "God said, “Let’s make man in our image, after our likeness. Let them have dominion over the fish of the sea, and over the birds of the sky, and over the livestock, and over all the earth, and over every creeping thing that creeps on the earth.”",
  ),
  verse(
    1,
    27,
    "God created man in his own image. In God’s image he created him; male and female he created them.",
  ),
  verse(
    1,
    28,
    "God blessed them. God said to them, “Be fruitful, multiply, fill the earth, and subdue it. Have dominion over the fish of the sea, over the birds of the sky, and over every living thing that moves on the earth.”",
  ),
  verse(
    1,
    29,
    "God said, “Behold, I have given you every herb yielding seed, which is on the surface of all the earth, and every tree, which bears fruit yielding seed. It will be your food.",
  ),
  verse(
    1,
    30,
    "To every animal of the earth, and to every bird of the sky, and to everything that creeps on the earth, in which there is life, I have given every green herb for food;” and it was so.",
  ),
  verse(
    1,
    31,
    "God saw everything that he had made, and, behold, it was very good. There was evening and there was morning, a sixth day.",
  ),
  verse(
    2,
    1,
    "The heavens, the earth, and all their vast array were finished.",
  ),
  verse(
    2,
    2,
    "On the seventh day God finished his work which he had done; and he rested on the seventh day from all his work which he had done.",
  ),
  verse(
    2,
    3,
    "God blessed the seventh day, and made it holy, because he rested in it from all his work of creation which he had done.",
  ),
];

/** Every verse a given day covers, so a level draws from its own passage. */
export function versesForDay(
  chapter: number,
  verseStart: number,
  verseEnd: number,
): SevenDaysVerse[] {
  return SEVEN_DAYS_VERSES.filter(
    (entry) =>
      entry.source.chapter === chapter &&
      entry.source.verseStart >= verseStart &&
      entry.source.verseStart <= verseEnd,
  );
}
