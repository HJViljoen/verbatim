// TWO BRIEF FIXTURES IN ONE FILE (merge, Block D wave 2). E-sales and
// E-marketing each created `components/print/fixture.ts`, and they hold two
// populated decks rather than two versions of one: the SALES brief (four
// borrowed surfaces plus wave 1's slide figures, `salesBrief*Fixture`) and the
// MARKETING brief (MARKETING_MAP's sections over the page fixtures,
// `marketingDeckFixture` / `refusedDeckFixture`). They share nothing but the
// page fixtures they both read, so both live here under their own names.

import { briefFiguresFixture, thinFiguresFixture, unreadFiguresFixture } from '@/components/blocks/brief-figures/fixture'
import { competitiveFixture } from '@/components/pages/competitive-surface/fixture'
import { subjectsFixture } from '@/components/pages/subjects/fixture'
import { methodFixture } from '@/lib/test/method-fixture'
import { briefSections } from '@/lib/reports/documents/load-reading'
import { SALES_MAP } from '@/lib/reports/documents/sections'
import { overviewFixture, refusedFixture as refusedOverview } from '@/components/pages/overview/fixture'
import { marketFixture } from '@/components/pages/market-surface/fixture'
import { blockReading, denominatorsOf, mergeReadings } from '@/lib/reports/documents/reading'
import { OVERVIEW_BLOCKS } from '@/components/pages/overview'
import { SUBJECT_BLOCKS } from '@/components/pages/subjects'
import { MARKET_BLOCKS } from '@/components/pages/market-surface'
import { MARKETING_MAP, sectionsOf } from '@/lib/reports/documents/sections'
import type { Gap } from '@/lib/reading/gap'
import type { Block } from '@/lib/blocks/types'
import type { DocBriefSection, DocLayoutEntry, DocPage, DocumentSnapshotData } from '@/lib/reports/documents/types'

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

/**
 * ONE MARKET ON ONE DECK.
 *
 * The artboard is a Sealand bag brief and `subjectsFixture()` is one too —
 * durability, recycled materials, "will it survive a wet commute". The
 * competitive fixture is NOT: its numbers are Össur's own, read read-only off
 * `month_denominators` on 2026-09-18, and its rival is Ottobock. So a deck
 * rendered from both carried Ottobock, "the prosthetics conversation" and "the
 * specific prosthetic model shown (3r85 or 3r80)" inside a bag brief — and
 * this fixture is now the object every later wave-2 package and every later
 * reviewer renders the sales brief from, so each of them would read the
 * incoherence as a data bug first.
 *
 * THE NUMBERS ARE NOT TOUCHED AND MUST NOT BE. They are measured, and the
 * competitive fixture's own header says so at length; replacing them with
 * invented bag-market counts would swap a real reading for fiction to make a
 * screenshot tidy. Only the NAMES are re-labelled, here rather than in
 * `components/pages/competitive-surface/fixture.ts`, which E-competitive owns
 * and whose own tests are written against Össur.
 *
 * A miss is caught rather than shipped: `document-deck-sales.test.tsx` renders
 * the whole deck and asserts that no word of the other market survives
 * anywhere in it, so a string added to the borrowed fixture later fails here
 * instead of appearing on a client's PDF.
 */
const RELABEL: readonly (readonly [RegExp, string])[] = [
  [/Össur/g, 'Sealand'],
  [/Ottobock/g, 'Freitag'],
  [/ottobock/g, 'freitag'],
  [/the specific prosthetic model shown \(3r85 or 3r80\)/g, 'the exact bag shown (the 39L or the 25L)'],
  [/Where can I get one of these fitted in Ireland\?/g, 'Where can I get one of these shipped to Ireland?'],
  [/what the battery costs to replace and how often it needs doing/g, 'what a zip costs to replace and how often it needs doing'],
  [/Hoeveel kos die battery om te vervang\?/g, 'Hoeveel kos dit om die rits te vervang?'],
  [/How much does the battery cost to replace\?/g, 'How much does the zip cost to replace?'],
  [/\bamputee\b/g, 'onebag'],
  // Before the bare word below, which would otherwise eat the chart's label.
  [/the prosthetics conversation/g, 'the category conversation'],
  [/\bprosthetics\b/g, 'buyitforlife'],
  [/\bbionics\b/g, 'manybaggers'],
]

const relabelString = (x: string): string => RELABEL.reduce((acc, [re, to]) => acc.replace(re, to), x)

/** Deep, over strings and object KEYS alike — an audience is `competitor:X`
 *  and a handle map is keyed by platform but valued by handle, and a rival's
 *  name reaches the page through both. */
function relabel<T>(value: T): T {
  if (typeof value === 'string') return relabelString(value) as unknown as T
  if (Array.isArray(value)) return value.map(relabel) as unknown as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [relabelString(k), relabel(v)]),
    ) as unknown as T
  }
  return value
}

const SURFACES = () => ({ subjects: subjectsFixture(), competitive: relabel(competitiveFixture()) })

/** Wave 1's slide figures, in the same market. Its month line is labelled
 *  "Durability · the prosthetics conversation" and nothing asserts that
 *  string, but the label is the chart's caption on `sales.p2` and it is the
 *  most visible word on the sheet. */
const FIGURES = {
  brief: () => relabel(briefFiguresFixture()),
  thin: () => relabel(thinFiguresFixture()),
  unread: () => relabel(unreadFiguresFixture()),
}

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
  const counted = countedPages(over.slideFigures === undefined ? FIGURES.brief() : over.slideFigures)
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
    slideFigures: FIGURES.brief(),
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
  base({ slideFigures: FIGURES.thin(), ...over })

/** Nothing named both and `month_kind_readings` is unapplied: no switching
 *  figure, no objection, no scripted row, no chart. Every one of those is an
 *  absence said in words. */
export const salesBriefUnreadFixture = (over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData =>
  base({ slideFigures: FIGURES.unread(), ...over })

/** A brief built before wave 2: no slide figures at all. What every stored
 *  Sales brief on production is, and it has to keep rendering. */
export const salesBriefLegacyFixture = (over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData =>
  base({ slideFigures: null, ...over })

// THE MARKETING BRIEF AS A DECK (package E-marketing, wave 2).
//
// WHY THE DECK NEEDED ITS OWN FIXTURE. Every other surface in Phase 1 has one
// and the printed brief did not: the only populated deck anywhere was a
// hand-typed twelve-line object inside `document-deck-sections.test.tsx`
// carrying one section and one method paragraph, which is why the deck's
// sheets, its stat tiles and its numbers card have never been looked at with
// data in them. A render tier that checks what a block PRINTS cannot check a
// deck it cannot populate.
//
// IT GOES THROUGH THE REAL BUILDERS. The sections are `MARKETING_MAP`'s own,
// resolved the way `briefSections` resolves them; the surfaces are the pages'
// own fixtures; the figures and the gaps are `blockReading` over those
// fixtures, which is the same function `loadBriefReading` calls. Nothing here
// is a second measurement of anything — a fixture that hand-typed its figures
// would agree with nothing the page prints, which is the whole failure the
// reading layer exists to prevent.
//
// TWO STATES, AND THE SECOND ONE IS PRODUCTION TODAY:
//   `marketingDeckFixture()` — the mock's Sealand month: subjects, gaps,
//                              movers, moves and the standings all read.
//   `refusedDeckFixture()`   — M1–M9 unapplied, which is both tenants today:
//                              five of the borrowed blocks degrade to a
//                              sentence and the reading carries no gap.

const SURFACE_BLOCKS: Record<string, readonly Block<never>[]> = {
  overview: OVERVIEW_BLOCKS as readonly Block<never>[],
  subjects: SUBJECT_BLOCKS as readonly Block<never>[],
  market: MARKET_BLOCKS as readonly Block<never>[],
}

/** The section rows a build freezes: the map's own, with each block's empty
 *  state resolved against the surface that was actually read. */
function sections(surfaces: Record<string, unknown>): DocBriefSection[] {
  return sectionsOf(MARKETING_MAP).map((s) => {
    const data = surfaces[s.surface]
    const block = SURFACE_BLOCKS[s.surface]?.find((b) => b.key === s.block)
    const empty = data == null
      ? 'This section could not be read for this month.'
      : block
        ? block.emptyState(data as never)
        : 'This section names a block this build does not know how to draw.'
    return {
      id: s.id, block: s.block, surface: s.surface, title: s.title, framing: s.framing, empty,
      ...(s.sheet ? { sheet: s.sheet } : {}),
      ...(s.span ? { span: s.span } : {}),
      ...(s.extras ? { extras: s.extras } : {}),
    }
  })
}

const PAGES: DocumentSnapshotData['pages'] = [
  {
    id: 'in_short',
    kind: 'in_short',
    title: 'In short',
    blocks: [
      {
        id: 'in_short.summary',
        field: 'summary',
        text: 'Durability is where the category’s conversation sits this month — [[subject_s1_share]] of its videos — and it arrives as a question, not as praise. The wet-commute question is asked across the category and answered on camera by nobody we read.',
      },
      { id: 'in_short.findings', field: 'findings', text: '', items: [] },
      {
        id: 'in_short.not_sure',
        field: 'not_sure',
        text: '',
        items: [
          'Your own shares move on 84 videos — too few to compare.',
          'Comparisons involving Poler, added 3 Sep, are refused.',
          'Whether the repairability push moved anything: the band is wider than the change.',
        ],
      },
    ],
  },
  {
    id: 'f1',
    kind: 'finding',
    title: 'A finding',
    blocks: [
      { id: 'f1.headline', field: 'headline', text: 'Durability is where the category’s conversation sits, and it is asked as a question, not praised.' },
      // A QUOTE ON EACH FINDING SHEET (`mkt.p4.quotes`). The fixture carried
      // none, so the one element the brief calls out on that sheet could not be
      // judged from the evidence at all — a populated fixture that leaves the
      // called-out element unpopulated is worse than no fixture there.
      // ONE, not the artboard's two: `DocBlock.quote` is a single quote per
      // block, and a second is a change to the composer's type and its writer
      // schema (both sales-owned). Recorded as a deviation.
      { id: 'f1.saw', field: 'saw', text: 'The subject is raised in [[subject_s1_share]] of the category’s videos, and the raising is almost always a question about what happens after a year of use.\n\nNobody we read answers it on camera.', quote: { ref: 'c:f1a', text: 'Mine is three winters in and the seams have not moved. Does it hold up in proper rain though?' } },
      { id: 'f1.heard', field: 'heard', text: '305 conversations across 3 strands of the research.' },
      { id: 'f1.means', field: 'means', text: 'The campaign has a question to answer rather than a claim to repeat.' },
      { id: 'f1.practice', field: 'practice', text: '', items: ['Answer the wet-commute question on camera.', 'Lead with repair, not with recycling.'] },
      { id: 'f1.sure', field: 'sure', text: 'Solid: many conversations, several strands. Heard across three straight months.' },
    ],
    meta: { sure: 'solid', n: '1', audiences: 'client,industry-other', history: '', conversations: '305', strands: '3' },
  },
  {
    id: 'f2',
    kind: 'finding',
    title: 'A finding',
    blocks: [
      { id: 'f2.headline', field: 'headline', text: 'The wet-commute question is category-wide; no tracked brand answers it on camera.' },
      { id: 'f2.saw', field: 'saw', text: 'It is asked under every tracked audience and under the category’s own videos.', quote: { ref: 'c:f2a', text: 'Nobody ever films one of these in the rain. That is the only thing I want to see.' } },
      { id: 'f2.heard', field: 'heard', text: '130 conversations across 2 strands of the research.' },
      { id: 'f2.means', field: 'means', text: 'The first brand to answer it owns the answer.' },
      { id: 'f2.practice', field: 'practice', text: '', items: ['Film one wet commute end to end.'] },
      { id: 'f2.sure', field: 'sure', text: 'Reasonable: enough conversations, two strands.' },
    ],
    meta: { sure: 'reasonable', n: '2', audiences: 'industry-other', history: '', conversations: '130', strands: '2' },
  },
  {
    id: 'method',
    kind: 'method',
    title: 'How this was read',
    blocks: [
      {
        id: 'method.method',
        field: 'method',
        text: '',
        items: [
          'This brief is a reading of September 2026, written from public conversation around Sealand, Freitag and the wider category. 1,388 videos in the category · 84 videos in your own brand · 11,840 comments read. Across TikTok 897 · YouTube 684 · Instagram 512 · Reddit 266. A month is dated by when the comment was written, not by when we looked, and this month is still filling. September 2026 · reading as at 28 Sep 2026 · still filling until 30 Oct 2026.',
          'The words quoted in it were read on TikTok, YouTube, Instagram, Reddit.',
          'Findings are the researcher’s readings of that conversation, ordered by the evidence behind them. Each rests on grounded points the analysis extracted and verified; confidence is judged from how many conversations and how many independent strands support the reading, never by the writer.',
        ],
      },
    ],
  },
]

function deck(surfaces: Record<string, unknown>, over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData {
  const parts = Object.entries(surfaces).map(([key, data]) => blockReading(SURFACE_BLOCKS[key], data as never))
  const merged = mergeReadings(parts)
  const overview = surfaces.overview as { subjects: { gaps: Record<string, Gap | null> } } | undefined
  const gaps = Object.values(overview?.subjects.gaps ?? {}).filter((g): g is Gap => g != null)
  const coverage = [
    { audience: 'industry-other', videos: 1388, comments: 9120, platformMix: {}, dualMention: 0 },
    { audience: 'client', videos: 84, comments: 1180, platformMix: {}, dualMention: 0 },
    { audience: 'competitor:Freitag', videos: 142, comments: 1540, platformMix: {}, dualMention: 0 },
  ]
  return {
    version: 1,
    kind: 'document',
    template: 'market_brief',
    reportId: 'r-marketing',
    title: 'Marketing brief',
    audience: 'marketing',
    company: 'Sealand',
    period: 'September 2026 · reading as at 28 Sep 2026',
    runId: null,
    figures: merged.figures,
    delta: null,
    reading: {
      month: '2026-09-01',
      monthLabel: 'September 2026',
      monthStatus: 'filling',
      readingAt: '2026-09-28T09:00:00.000Z',
      stamp: 'September 2026 · reading as at 28 Sep 2026 · still filling until 30 Oct 2026',
      denominators: denominatorsOf(
        coverage as never,
        (a) => (a === 'client' ? 'your own brand' : a === 'industry-other' ? 'the category' : a.slice('competitor:'.length)),
      ),
      platformMix: { tiktok: 897, youtube: 684, instagram: 512, reddit: 266 },
      crossesClustering: false,
      ...(gaps.length ? { gaps } : {}),
      ...(merged.verdicts.length ? { verdicts: merged.verdicts } : {}),
    },
    sections: sections(surfaces),
    surfaces,
    // MARKETING_MAP opts out of the cover sheet (`COVER_FOLDED_MAPS`), and
    // `composeDocument` freezes that decision onto the snapshot rather than
    // leaving the deck to re-derive it from today's map. A fixture that did not
    // carry the field would be a brief built before the fold.
    cover: false,
    // And MARKETING_MAP asks for the sections it could not fill to share one
    // sheet rather than taking a landscape sheet each (`UNFILLED_SHEET_MAPS`).
    // The refused arm is what this is for: five of its blocks degrade to a
    // sentence, which was five sheets carrying a sentence apiece.
    unfilledSheet: true,
    // THE MAP'S OWN ORDER, walked the way `composeDocument` walks it — written
    // pages and borrowed blocks interleaved, a `finding` entry expanding to
    // every finding page. A fixture that listed the sections first and the
    // pages after would agree with no brief this product builds.
    layout: MARKETING_MAP.flatMap<DocLayoutEntry>((e) =>
      e.kind === 'block'
        ? [{ kind: 'section', id: e.section.id }]
        : PAGES.filter((p) => p.kind === e.page).map((p) => ({ kind: 'page', id: p.id })),
    ),
    pages: PAGES,
    lens: { means: 'What it means for the message', short: 'for the message' },
    method: {
      conversations: 9120,
      videos: 2359,
      clientVideos: 84,
      competitorVideos: 142,
      period: 'September 2026 · reading as at 28 Sep 2026',
      sources: ['tiktok', 'youtube', 'instagram', 'reddit'],
      heldBack: 14,
      thin: false,
      findingsBelow: 5,
      languages: '27% of what was said on camera was not in English',
      delivery: '23 updates since 6 Apr 2026 · longest gap 35 days · last on 27 Sep 2026 — your 3rd monthly reading, the quarter view needs 6',
    },
    notSureYet: [],
    generatedAt: '2026-09-28T09:00:00.000Z',
    model: 'fixture',
    promptVersion: 'market_brief_v1',
    ...over,
  }
}

/** The mock's Sealand month, every borrowed block read. */
export function marketingDeckFixture(over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData {
  return deck({ overview: overviewFixture(), subjects: subjectsFixture(), market: marketFixture() }, over)
}

/**
 * PRODUCTION TODAY: M1–M9 unapplied, so five of the borrowed blocks degrade to
 * their own sentence and the reading carries no gap at all. The layout has to
 * survive that — a sheet of two blocks where both refuse is still a sheet.
 */
export function refusedDeckFixture(over: Partial<DocumentSnapshotData> = {}): DocumentSnapshotData {
  return deck({ overview: refusedOverview(), subjects: subjectsFixture(), market: marketFixture() }, over)
}
