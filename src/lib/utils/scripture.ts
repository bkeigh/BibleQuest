/**
 * Scripture display helpers.
 *
 * Our cards frame verse text in their own curly quotes for a devotional feel.
 * But the World English Bible source often includes its own opening/closing
 * quotation marks (direct speech from God or Jesus). Rendering both produces
 * doubled quotes. cleanVerseText strips a single balanced leading/trailing
 * quote so the card is always the single source of the quote marks.
 */
const LEAD_QUOTE = /^[“”‘’"']+\s*/;
const TRAIL_QUOTE = /\s*[“”‘’"']+$/;

export function cleanVerseText(text: string): string {
  return text.trim().replace(LEAD_QUOTE, "").replace(TRAIL_QUOTE, "").trim();
}
