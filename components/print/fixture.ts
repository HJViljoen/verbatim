import { briefFiguresFixture, thinFiguresFixture, unreadFiguresFixture } from '@/components/blocks/brief-figures/fixture'
import { competitiveFixture } from '@/components/pages/competitive-surface/fixture'
import { subjectsFixture } from '@/components/pages/subjects/fixture'
import { methodFixture } from '@/lib/test/method-fixture'
import { briefSections } from '@/lib/reports/documents/load-reading'
import { SALES_MAP } from '@/lib/reports/documents/sections'
import type { DocLayoutEntry, DocPage, DocumentSnapshotData } from '@/lib/reports/documents/types'

/**
 * The Sales brief, as a frozen snapshot (Block D wave 2, package E-sales).
 *
 * THE REVIEW SURFACE. A brief cannot be rendered from a session — there is no
 * cookie in a test and no tenant behind one — so the artboard port is reviewed
 * against this: the four borrowed surfaces at their own populated fixtures,
 * wave 1's slide figures at theirs, and the written pages as a build composes
 * them. Every render test in `document-deck*.test.tsx` and the side-by-side
 * screenshot read the same object, so a sheet cannot pass a test in one shape
 * and be photographed in another.
 *
 * NOTHING IS HAND-TYPED THAT A BUILDER MAKES. The sections come out of
 * `briefSections(SALES_MAP, …)` — the composer's own resolver — so a section
 * that could not be filled says the thing the product would actually say, and
 * a block key renamed in the map breaks this fixture rather than silently
 * drawing nothing.
 *
 * TWO STATES, AND THE SECOND ONE IS PRODUCTION. `salesBriefFixture()` is a
 * month that reads on every side. `salesBriefThinFixture()` is both live
 * workspaces today: the switching pool is 35 videos where a banded reading
 * needs 100, and the month tables the objection comes from are unapplied — so
 * the tiles refuse, the chart names its months instead of drawing them and the
 * "Say this" sheet has no row.
 */

const MONTH_STAMP = 'September 2026 · reading as at 28 September 2026 · still filling until 30 October 2026'

const FINDING: DocPage = {
  id: 'f1',
  kind: 'finding',
  title: 'Findings',
  blocks: [
    { id: 'f1.headline', field: 'headline', text: 'The objection to answer is longevity, not cost.' },
    {
      id: 'f1.saw', field: 'saw',
      text: 'Price comes up more than anything else, but it almost never comes up alone: it is argued against how long the bag lasts, and the second half of that sentence is the one the category keeps returning to.\n\nThe durability question is asked in the customers’ own words, and it is asked of every brand in the set.',
      quote: { ref: 'c:q1', text: 'Three winters on the bike and the seams are still perfect. The zip, less so.' },
    },
    { id: 'f1.heard', field: 'heard', text: 'Heard across the category and in your own audience.' },
    { id: 'f1.means', field: 'means', text: 'Lead with the thing you can show: a bag that came through the wet, and the repair that follows it.' },
    {
      id: 'f1.practice', field: 'practice', text: '',
      items: [
        'Open on the wet commute — it is the question the category is asking, and no tracked brand answers it on camera.',
        'Say “one bag for life”, not “eco”.',
      ],
    },
    { id: 'f1.sure', field: 'sure', text: 'Reasonable: the phrases are counted in the category; your own audience is thin.' },
  ],
  meta: { sure: 'reasonable', n: '1', audiences: 'client,industry-other', history: '', conversations: '1388', strands: '4' },
}

const IN_SHORT: DocPage = {
  id: 'in_short',
  kind: 'in_short',
  title: 'Overview',
  blocks: [
    {
      id: 'in_short.summary', field: 'summary',
      text: 'Four objections carry September, and the largest is price against longevity — heard across [[videos]] category videos. Three selling points come back in the customers’ own words: it never leaked, one bag for life, they repair it.',
    },
    { id: 'in_short.findings', field: 'findings', text: '', items: ['The objection to answer is longevity, not cost.'] },
    { id: 'in_short.not_sure', field: 'not_sure', text: '', items: ['Whether buckle and strap complaints can be compared at all: 44 videos this month, with no earlier figure beside them.'] },
  ],
}

const METHOD: DocPage = {
  id: 'method',
  kind: 'method',
  title: 'About this brief',
  blocks: [
    {
      id: 'method.method', field: 'method', text: '',
      items: [
        'This brief is a reading of September 2026, written from public conversation around Sealand, Freitag, Cotopaxi and the wider category. 1,388 videos in the category · 84 videos in your own brand · 2,359 comments read. Across TikTok 161 · YouTube 135 · Instagram 85 · Reddit 68. A month is dated by when the comment was written, not by when we looked, and this month is still filling. September 2026 · reading as at 28 September 2026 · still filling until 30 October 2026.',
        'Findings are the researcher’s readings of that conversation, ordered by the evidence behind them.',
        '23 updates since 6 Apr 2026 · longest gap 35 days · last on 27 Sep 2026 — your 6th monthly reading.',
      ],
    },
  ],
}

const LANGUAGE: DocPage = {
  id: 'language',
  kind: 'language',
  title: 'Language to handle with care',
  blocks: [
    {
      id: 'language.care', field: 'care', text: '',
      items: [
        '“eco”: the category treats it as a claim to be checked, not a feature.',
        '“lifetime”: read as a warranty promise, and asked about as one.',
      ],
    },
  ],
}

const SURFACES = () => ({ subjects: subjectsFixture(), competitive: competitiveFixture() })

/** SALES_MAP's own order, which is the artboard's. The composer builds this
 *  list; it is written out here so a reorder of the map that this fixture does
 *  not follow shows up as a failing render test rather than as a sheet in the
 *  wrong place. */
const LAYOUT: DocLayoutEntry[] = [
  { kind: 'page', id: 'in_short' },
  { kind: 'page', id: 'f1' },
  { kind: 'section', id: 'sl.unanswered' },
  { kind: 'section', id: 'sl.voices' },
  { kind: 'section', id: 'sl.rivals' },
  { kind: 'section', id: 'sl.questions' },
  { kind: 'page', id: 'switching' },
  { kind: 'page', id: 'scripted' },
  { kind: 'page', id: 'language' },
  { kind: 'page', id: 'method' },
]

const SWITCHING: DocPage = { id: 'switching', kind: 'switching', title: 'Who is moving, and which way', blocks: [] }
const SCRIPTED: DocPage = { id: 'scripted', kind: 'scripted', title: 'Answers you can use', blocks: [] }

/**
 * The composer's own rule, reproduced: a page whose only material is missing
 * DROPS OUT rather than printing an empty sheet (`compose.ts`). The two
 * counted sheets have no blocks, so their material is the slide figures — and
 * a fixture that kept them in `pages` while the figures said there was nothing
 * would be testing a document the build cannot produce.
 */
function countedPages(figures: DocumentSnapshotData['slideFigures']): { pages: DocPage[]; layout: DocLayoutEntry[] } {
  const has = { switching: Boolean(figures?.switching), scripted: Boolean(figures?.scripted.length) }
  const keep = (id: string) => (id === 'switching' ? has.switching : id === 'scripted' ? has.scripted : true)
  return {
    pages: [IN_SHORT, FINDING, SWITCHING, SCRIPTED, LANGUAGE, METHOD].filter((p) => keep(p.id)),
    layout: LAYOUT.filter((e) => e.kind !== 'page' || keep(e.id)),
  }
}

function base(over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData {
  const surfaces = SURFACES()
  const counted = countedPages(over.slideFigures === undefined ? briefFiguresFixture() : over.slideFigures)
  return {
    version: 1,
    kind: 'document',
    template: 'sales_brief',
    reportId: 'rep-sales',
    title: 'Sales brief',
    audience: 'sales',
    company: 'Sealand',
    period: 'September 2026',
    runId: 'run-1',
    figures: {
      reading_month: { label: 'the month this reading is of', value: 'September 2026', kind: 'name' },
      conversations: { label: 'comments read in September 2026', value: '2,359', kind: 'count' },
      videos: { label: 'videos read for the category in September 2026', value: '1,388', kind: 'count' },
      client_videos: { label: 'Sealand videos in September 2026', value: '84', kind: 'count' },
    },
    delta: null,
    reading: {
      month: '2026-09-01',
      monthLabel: 'September 2026',
      monthStatus: 'filling',
      readingAt: '2026-09-28T06:00:00.000Z',
      stamp: MONTH_STAMP,
      denominators: [
        { audience: 'industry-other', label: 'the category', videos: 1388, comments: 1704 },
        { audience: 'competitor:Freitag', label: 'Freitag’s audience', videos: 142, comments: 402 },
        { audience: 'client', label: 'your own brand', videos: 84, comments: 253 },
      ],
      platformMix: { tiktok: 161, youtube: 135, instagram: 85, reddit: 68 },
      crossesClustering: false,
      // Through the real `methodLines`, over a `RecordInputs` shaped like
      // Sealand's — never a hand-typed footnote (`lib/test/method-fixture.ts`).
      method: methodFixture('Sealand'),
      confidence: { word: 'reasonable', why: '9 of 12 comparisons on these pages were answered against their band.' },
      delivery: '23 updates since 6 Apr 2026 · longest gap 35 days · last on 27 Sep 2026',
    },
    sections: briefSections(SALES_MAP, surfaces, []),
    surfaces,
    layout: counted.layout,
    slideFigures: briefFiguresFixture(),
    pages: counted.pages,
    role: 'sales_brief',
    lens: { means: 'What it means for a sale', short: 'for a sale' },
    method: {
      conversations: 2359, videos: 1388, clientVideos: 84, competitorVideos: 356,
      period: 'September 2026', sources: ['tiktok', 'youtube', 'instagram', 'reddit'],
      heldBack: 192, thin: false, dropped: 3,
    },
    notSureYet: ['Whether buckle and strap complaints can be compared at all: 44 videos this month, with no earlier figure beside them.'],
    generatedAt: '2026-09-28T06:00:00.000Z',
    model: 'gpt-5.4',
    promptVersion: 'sales_brief_v1',
    ...over,
  }
}

/** A month that reads on every side. */
export const salesBriefFixture = (over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData => base(over)

/** PRODUCTION TODAY on both live workspaces: the pool is under the floor and
 *  the month line has two readings, so the figures refuse and say how many
 *  they had. */
export const salesBriefThinFixture = (over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData =>
  base({ slideFigures: thinFiguresFixture(), ...over })

/** Nothing named both and `month_kind_readings` is unapplied: no switching
 *  figure, no objection, no scripted row, no chart. Every one of those is an
 *  absence said in words. */
export const salesBriefUnreadFixture = (over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData =>
  base({ slideFigures: unreadFiguresFixture(), ...over })

/** A brief built before wave 2: no slide figures at all. What every stored
 *  Sales brief on production is, and it has to keep rendering. */
export const salesBriefLegacyFixture = (over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData =>
  base({ slideFigures: null, ...over })
