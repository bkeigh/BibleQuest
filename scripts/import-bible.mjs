/**
 * BibleQuest — World English Bible (WEB) importer.
 *
 * Downloads the full public-domain World English Bible from
 * https://github.com/TehShrike/world-english-bible (JSON, public domain)
 * and produces:
 *
 *   src/data/bible/<book-slug>.json   — { slug, name, testament, order, chapters: string[][] }
 *   src/data/bible/books.json         — canon metadata with real chapter counts
 *   src/data/seed/daily-verses.json   — curated daily verse pool with exact WEB text
 *
 * Run: node scripts/import-bible.mjs
 *
 * The WEB is in the public domain — no copyright, no license required.
 * See https://worldenglish.bible/ for translation details.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const RAW = 'https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json'
const OUT_BIBLE = path.join(process.cwd(), 'src/data/bible')
const OUT_SEED = path.join(process.cwd(), 'src/data/seed')

/** Canonical Protestant 66-book canon. `file` is the TehShrike json filename stem. */
const CANON = [
  // — Old Testament
  ['Genesis', 'genesis'], ['Exodus', 'exodus'], ['Leviticus', 'leviticus'], ['Numbers', 'numbers'],
  ['Deuteronomy', 'deuteronomy'], ['Joshua', 'joshua'], ['Judges', 'judges'], ['Ruth', 'ruth'],
  ['1 Samuel', '1samuel'], ['2 Samuel', '2samuel'], ['1 Kings', '1kings'], ['2 Kings', '2kings'],
  ['1 Chronicles', '1chronicles'], ['2 Chronicles', '2chronicles'], ['Ezra', 'ezra'], ['Nehemiah', 'nehemiah'],
  ['Esther', 'esther'], ['Job', 'job'], ['Psalms', 'psalms'], ['Proverbs', 'proverbs'],
  ['Ecclesiastes', 'ecclesiastes'], ['Song of Solomon', 'songofsolomon'], ['Isaiah', 'isaiah'], ['Jeremiah', 'jeremiah'],
  ['Lamentations', 'lamentations'], ['Ezekiel', 'ezekiel'], ['Daniel', 'daniel'], ['Hosea', 'hosea'],
  ['Joel', 'joel'], ['Amos', 'amos'], ['Obadiah', 'obadiah'], ['Jonah', 'jonah'],
  ['Micah', 'micah'], ['Nahum', 'nahum'], ['Habakkuk', 'habakkuk'], ['Zephaniah', 'zephaniah'],
  ['Haggai', 'haggai'], ['Zechariah', 'zechariah'], ['Malachi', 'malachi'],
  // — New Testament
  ['Matthew', 'matthew'], ['Mark', 'mark'], ['Luke', 'luke'], ['John', 'john'],
  ['Acts', 'acts'], ['Romans', 'romans'], ['1 Corinthians', '1corinthians'], ['2 Corinthians', '2corinthians'],
  ['Galatians', 'galatians'], ['Ephesians', 'ephesians'], ['Philippians', 'philippians'], ['Colossians', 'colossians'],
  ['1 Thessalonians', '1thessalonians'], ['2 Thessalonians', '2thessalonians'], ['1 Timothy', '1timothy'], ['2 Timothy', '2timothy'],
  ['Titus', 'titus'], ['Philemon', 'philemon'], ['Hebrews', 'hebrews'], ['James', 'james'],
  ['1 Peter', '1peter'], ['2 Peter', '2peter'], ['1 John', '1john'], ['2 John', '2john'],
  ['3 John', '3john'], ['Jude', 'jude'], ['Revelation', 'revelation'],
].map(([name, file], i) => ({
  name,
  file,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  order: i + 1,
  testament: i < 39 ? 'old' : 'new',
}))

/** Curated daily-verse pool: [bookSlug, chapter, startVerse, endVerse, theme] */
const DAILY_VERSES = [
  ['john', 3, 16, 16, 'love'],
  ['psalms', 23, 1, 3, 'rest'],
  ['psalms', 46, 10, 10, 'stillness'],
  ['isaiah', 40, 31, 31, 'renewal'],
  ['isaiah', 41, 10, 10, 'courage'],
  ['isaiah', 26, 3, 3, 'peace'],
  ['jeremiah', 29, 11, 11, 'hope'],
  ['matthew', 5, 14, 16, 'kindness'],
  ['matthew', 6, 33, 34, 'trust'],
  ['matthew', 11, 28, 30, 'rest'],
  ['matthew', 22, 37, 39, 'love'],
  ['matthew', 7, 7, 8, 'prayer'],
  ['philippians', 4, 6, 7, 'peace'],
  ['philippians', 4, 13, 13, 'courage'],
  ['romans', 8, 28, 28, 'trust'],
  ['romans', 8, 38, 39, 'love'],
  ['romans', 12, 12, 12, 'hope'],
  ['romans', 15, 13, 13, 'hope'],
  ['joshua', 1, 9, 9, 'courage'],
  ['proverbs', 3, 5, 6, 'trust'],
  ['proverbs', 16, 3, 3, 'work'],
  ['psalms', 118, 24, 24, 'gratitude'],
  ['psalms', 121, 1, 2, 'trust'],
  ['psalms', 139, 23, 24, 'honesty'],
  ['lamentations', 3, 22, 23, 'renewal'],
  ['micah', 6, 8, 8, 'justice'],
  ['zephaniah', 3, 17, 17, 'love'],
  ['galatians', 5, 22, 23, 'growth'],
  ['galatians', 6, 9, 9, 'perseverance'],
  ['ephesians', 2, 8, 10, 'grace'],
  ['ephesians', 4, 32, 32, 'forgiveness'],
  ['colossians', 3, 12, 12, 'kindness'],
  ['colossians', 3, 23, 23, 'work'],
  ['1-thessalonians', 5, 11, 11, 'encouragement'],
  ['1-thessalonians', 5, 16, 18, 'gratitude'],
  ['hebrews', 10, 24, 25, 'community'],
  ['hebrews', 11, 1, 1, 'faith'],
  ['james', 1, 19, 19, 'patience'],
  ['james', 1, 22, 22, 'action'],
  ['james', 4, 8, 8, 'prayer'],
  ['1-peter', 5, 7, 7, 'rest'],
  ['1-john', 4, 7, 7, 'love'],
  ['1-john', 4, 19, 19, 'love'],
  ['psalms', 27, 1, 1, 'courage'],
  ['psalms', 34, 8, 8, 'gratitude'],
  ['psalms', 51, 10, 10, 'renewal'],
  ['psalms', 90, 12, 12, 'wisdom'],
  ['psalms', 103, 2, 4, 'gratitude'],
  ['psalms', 19, 14, 14, 'prayer'],
  ['mark', 12, 30, 31, 'love'],
  ['luke', 6, 31, 31, 'kindness'],
  ['luke', 12, 34, 34, 'treasure'],
  ['john', 1, 5, 5, 'hope'],
  ['john', 13, 34, 35, 'love'],
  ['john', 14, 27, 27, 'peace'],
  ['john', 15, 5, 5, 'growth'],
  ['1-corinthians', 13, 4, 7, 'love'],
  ['1-corinthians', 16, 14, 14, 'love'],
  ['2-corinthians', 5, 17, 17, 'renewal'],
  ['deuteronomy', 31, 8, 8, 'courage'],
]

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url)
  if (!res.ok) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt))
      return fetchJson(url, attempt + 1)
    }
    throw new Error(`${res.status} for ${url}`)
  }
  return res.json()
}

/** Parse TehShrike entry list into chapters[ci][vi] verse text. */
function parseBook(entries) {
  const chapters = []
  for (const e of entries) {
    if (!e || typeof e.value !== 'string') continue
    const c = e.chapterNumber
    const v = e.verseNumber
    if (!Number.isInteger(c) || !Number.isInteger(v) || c < 1 || v < 1) continue
    if (!chapters[c - 1]) chapters[c - 1] = []
    chapters[c - 1][v - 1] = (chapters[c - 1][v - 1] ?? '') + e.value
  }
  // Normalize whitespace, guard against sparse arrays
  return chapters.map((ch) =>
    (ch ?? []).map((verse) => (verse ?? '').replace(/\s+/g, ' ').trim())
  )
}

async function main() {
  await mkdir(OUT_BIBLE, { recursive: true })
  await mkdir(OUT_SEED, { recursive: true })

  const meta = []
  const bySlug = new Map()

  // Modest concurrency to be polite to raw.githubusercontent.com
  const queue = [...CANON]
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const book = queue.shift()
      const entries = await fetchJson(`${RAW}/${book.file}.json`)
      const chapters = parseBook(entries)
      if (!chapters.length) throw new Error(`No chapters parsed for ${book.name}`)
      const data = {
        slug: book.slug,
        name: book.name,
        testament: book.testament,
        order: book.order,
        chapters,
      }
      await writeFile(path.join(OUT_BIBLE, `${book.slug}.json`), JSON.stringify(data))
      bySlug.set(book.slug, data)
      meta.push({
        slug: book.slug,
        name: book.name,
        testament: book.testament,
        order: book.order,
        chapterCount: chapters.length,
        verseCounts: chapters.map((ch) => ch.length),
      })
      process.stdout.write(`✓ ${book.name} (${chapters.length} ch)\n`)
    }
  })
  await Promise.all(workers)

  meta.sort((a, b) => a.order - b.order)
  await writeFile(path.join(OUT_BIBLE, 'books.json'), JSON.stringify(meta, null, 1))

  // Daily verse pool with exact WEB text pulled from the imported data
  const pool = DAILY_VERSES.map(([slug, chapter, start, end, theme], i) => {
    const book = bySlug.get(slug)
    if (!book) throw new Error(`Unknown book slug in DAILY_VERSES: ${slug}`)
    const ch = book.chapters[chapter - 1]
    if (!ch) throw new Error(`Missing ${slug} ${chapter}`)
    const text = ch.slice(start - 1, end).join(' ')
    if (!text) throw new Error(`Empty text for ${slug} ${chapter}:${start}-${end}`)
    const refBook = book.name === 'Psalms' ? 'Psalm' : book.name
    const reference = start === end ? `${refBook} ${chapter}:${start}` : `${refBook} ${chapter}:${start}-${end}`
    return { id: `dv${String(i + 1).padStart(2, '0')}`, reference, bookSlug: slug, chapter, verseStart: start, verseEnd: end, text, theme }
  })
  await writeFile(path.join(OUT_SEED, 'daily-verses.json'), JSON.stringify(pool, null, 1))

  const totalVerses = meta.reduce((n, b) => n + b.verseCounts.reduce((x, y) => x + y, 0), 0)
  console.log(`\nDone: ${meta.length} books, ${meta.reduce((n, b) => n + b.chapterCount, 0)} chapters, ${totalVerses} verses.`)
  console.log(`Daily verse pool: ${pool.length} entries.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
