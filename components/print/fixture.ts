import { overviewFixture, refusedFixture as refusedOverview } from '@/components/pages/overview/fixture'
import { subjectsFixture } from '@/components/pages/subjects/fixture'
import { marketFixture } from '@/components/pages/market-surface/fixture'
import { blockReading, denominatorsOf, mergeReadings } from '@/lib/reports/documents/reading'
import { OVERVIEW_BLOCKS } from '@/components/pages/overview'
import { SUBJECT_BLOCKS } from '@/components/pages/subjects'
import { MARKET_BLOCKS } from '@/components/pages/market-surface'
import { MARKETING_MAP, sectionsOf } from '@/lib/reports/documents/sections'
import type { Gap } from '@/lib/reading/gap'
import type { DocBriefSection, DocLayoutEntry, DocumentSnapshotData } from '@/lib/reports/documents/types'
import type { Block } from '@/lib/blocks/types'

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
      { id: 'f1.saw', field: 'saw', text: 'The subject is raised in [[subject_s1_share]] of the category’s videos, and the raising is almost always a question about what happens after a year of use.\n\nNobody we read answers it on camera.' },
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
      { id: 'f2.saw', field: 'saw', text: 'It is asked under every tracked audience and under the category’s own videos.' },
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
