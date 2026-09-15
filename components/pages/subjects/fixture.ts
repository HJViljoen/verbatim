import { horizonWindow } from '@/lib/reading/horizon'
import { buildSeries, type DenominatorPoint, type NumeratorPoint } from '@/lib/reading/series'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { kindShares, redditRead } from '@/lib/reading/kinds'
import {
  axisNote,
  setLine,
  SUPERSEDE_RULE,
  UNANSWERED_BASIS,
  REDDIT_THREAD_CAP,
  unansweredLead,
  buildSides,
  type StoredKindRow,
  type SubjectsData,
} from '@/lib/pages/subjects'
import type { Subject } from '@/lib/subjects/types'

// The Subjects page's block fixtures (Phase 1 WP12).
//
// THREE STATES, ALL REAL. `subjectsFixture()` is the mock's own reading — six
// subjects, Durability selected, the category climbing three months running.
// `refusedFixture()` is the state PRODUCTION is in today: M4 unapplied, so the
// subjects, the months, the moves and the kind mix all come back as sentences
// saying what is not recorded yet. `candidatesFixture()` is a tenant that has
// been proposed a set and confirmed none of it — the state every tenant passes
// through, and the one where "0 named" would read as a bug.

const MONTH = '2026-09-01'
const NOW = '2026-09-28T09:00:00.000Z'
const AXIS = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', MONTH]

const RIVAL = 'competitor:Freitag'

const subject = (over: Partial<Subject> = {}): Subject => ({
  id: 's1', client_id: 'c1', name: 'Durability', description: 'Whether the bag lasts',
  origin: 'category_theme', source_ref: null, named_at: '2026-08-19', status: 'active',
  superseded_by: null, embedded_at: null, embed_input_version: null,
  calibrated_at: '2026-09-01', calibration_precision: 0.9, calibration_n: 200,
  calibration_judge_version: null,
  ...over,
})

function sidesAndSeries() {
  const denominators: DenominatorPoint[] = []
  const per = new Map<string, number>()
  const add = (month: string, audience: string, videos: number) => {
    denominators.push({
      month, audience, videos, comments: videos * 9,
      status: month === MONTH ? 'filling' : 'frozen',
      origin: 'live', read_at: `${month}T00:00:00Z`, run_id: 'r1',
    })
    per.set(`${month}|${audience}`, videos)
  }
  for (const m of AXIS) {
    // April is below the floor for your own audience — the mock's own case.
    add(m, CLIENT_AUDIENCE, m === '2026-04-01' ? 22 : 84)
    add(m, RIVAL, 142)
    add(m, INDUSTRY_AUDIENCE, 1388)
  }

  const catK: Record<string, number> = {
    '2026-04-01': 160, '2026-05-01': 190, '2026-06-01': 214,
    '2026-07-01': 236, '2026-08-01': 264, [MONTH]: 340,
  }
  const readings = (audience: string, k: (m: string) => number): NumeratorPoint[] =>
    AXIS.map((m) => ({ month: m, audience, videos: k(m), comments: k(m) * 3, run_id: 'r1' }))

  const seriesFor = (subjectId: string, audience: string) => {
    const k = audience === INDUSTRY_AUDIENCE ? (m: string) => catK[m]
      : audience === CLIENT_AUDIENCE ? () => 26
        : () => 62
    return buildSeries({ axis: AXIS, audience, denominators, readings: readings(audience, k), objectId: subjectId, objectLabel: 'Durability' })
  }

  const kindRows: StoredKindRow[] = [CLIENT_AUDIENCE, RIVAL, INDUSTRY_AUDIENCE].flatMap((audience): StoredKindRow[] => {
    const n = per.get(`${MONTH}|${audience}`) ?? 0
    return [
      { month: MONTH, audience, kind: 'question', videos: Math.round(n * 0.34), comments: 0, platform_mix: { reddit: Math.round(n * 0.13), tiktok: Math.round(n * 0.21) } },
      { month: MONTH, audience, kind: 'praise', videos: Math.round(n * 0.28), comments: 0, platform_mix: null },
      { month: MONTH, audience, kind: 'objection', videos: Math.round(n * 0.19), comments: 0, platform_mix: { reddit: Math.round(n * 0.04) } },
    ]
  })

  const sides = buildSides({
    subject: subject(),
    rivals: [{ name: 'Freitag', retiredAt: null }],
    leadRival: { name: 'Freitag', retiredAt: null },
    month: MONTH,
    prevMonth: '2026-08-01',
    axis: AXIS,
    perAudience: per,
    kindRows,
    seriesFor,
    thin: false,
  })
  const series = sides.map((s) => seriesFor('s1', s.audience))
  return { sides, series, per, kindRows }
}

export function subjectsFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const { sides, series } = sidesAndSeries()
  const window = horizonWindow('last_12', NOW, '2026-04-01')
  const rows = [
    { id: 's1', name: 'Durability', pct: 31, k: 26 },
    { id: 's2', name: 'Recycled materials', pct: 46, k: 39 },
    { id: 's3', name: 'Waterproofing', pct: 20, k: 17 },
  ]
  const unansweredRows = [
    { id: 'will it survive a wet commute', label: 'Will it survive a wet commute', videos: 130, reddit: 49, answered: false, href: null },
    { id: 'zips failing after a year', label: 'Zips failing after a year', videos: 71, reddit: 20, answered: false, href: null },
  ]

  return {
    brand: 'Sealand',
    month: MONTH,
    monthStatus: 'filling',
    readingAt: NOW,
    horizon: 'last_12',
    window,
    axis: AXIS,
    substrate: 'seeded',
    notes: [],
    list: {
      rows: rows.map((r, i) => ({
        id: r.id,
        name: r.name,
        description: i === 0 ? 'Whether the bag lasts' : null,
        origin: 'category_theme' as const,
        namedAt: '2026-08-19',
        status: 'active' as const,
        calibration: 'ready' as const,
        level: { k: r.k, n: 84, pct: r.pct },
        note: null,
        selected: i === 0,
        href: `/dashboard/subjects?item=${r.id}`,
      })),
      proposed: [],
      rule: SUPERSEDE_RULE,
      notRecorded: null,
      setLine: setLine(rows.length, 0),
    },
    selected: {
      id: 's1',
      name: 'Durability',
      description: 'Whether the bag lasts',
      namedAt: '2026-08-19',
      origin: 'category_theme',
      calibration: 'ready',
      index: 1,
      of: 3,
      sides,
      series,
      voices: [
        {
          quote: { ref: 'e:1', text: 'Three winters on the bike and the seams are still perfect. The zip, less so.' },
          cite: 'tiktok · 14 Sep · under a category video',
          href: null,
          from: 'under a category video',
        },
        {
          quote: { ref: 'e:2', text: 'Nach 14 Monaten ist der Reißverschluss hin', lang: 'de', english: 'After 14 months the zip is done' },
          cite: 'youtube · 22 Sep · under a Freitag video',
          href: null,
          from: 'under a Freitag video',
        },
      ],
      voicesFrom: 41,
      unanswered: {
        rows: unansweredRows,
        questionVideos: 214,
        population: 1388,
        yourPosts: 9,
        lead: unansweredLead(unansweredRows, 9, 'September'),
        basis: UNANSWERED_BASIS,
        reddit: REDDIT_THREAD_CAP,
        refusal: null,
      },
      move: null,
      behind: { videos: 26, href: '/dashboard/videos?subject=s1' },
      axisNote: axisNote(sides, 100),
      notRecorded: null,
    },
    record: {
      line: '4 updates · 2,359 videos · TikTok, YouTube, Instagram, Reddit',
      lines: ['4 updates delivered in this window.', 'Nothing was refused on this page.'],
      href: '/dashboard/settings',
      freezesOn: '2026-10-31',
    },
    ...over,
  }
}

/** The state production is in today: M4 authored and not applied. */
export function refusedFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const base = subjectsFixture()
  return {
    ...base,
    substrate: 'missing',
    list: {
      rows: [],
      proposed: [],
      rule: SUPERSEDE_RULE,
      notRecorded: 'Your subjects are not recorded for this workspace yet.',
      setLine: setLine(0, 0),
    },
    selected: null,
    ...over,
  }
}

/** A tenant that has been proposed a set and confirmed none of it. */
export function candidatesFixture(over: Partial<SubjectsData> = {}): SubjectsData {
  const base = subjectsFixture()
  return {
    ...base,
    list: {
      rows: [],
      proposed: [
        { id: 'p1', name: 'Durability', because: 'the category raised it in the videos we read' },
        { id: 'p2', name: 'Recycled materials', because: 'you said this in your own posts' },
      ],
      rule: SUPERSEDE_RULE,
      notRecorded: null,
      setLine: setLine(0, 2),
    },
    selected: null,
    ...over,
  }
}

/** The kind mix as `buildSides` produced it, for a test that wants the shares
 *  without rebuilding the fixture. */
export function fixtureKindShares() {
  const { kindRows, per } = sidesAndSeries()
  const rowsHere = kindRows.filter((r) => r.audience === INDUSTRY_AUDIENCE)
  const shares = kindShares(
    rowsHere.map((r) => ({ kind: r.kind, videos: r.videos, comments: r.comments, ...(r.platform_mix ? { platform_mix: r.platform_mix } : {}) })),
    per.get(`${MONTH}|${INDUSTRY_AUDIENCE}`) ?? 0,
  )
  return { shares, reddit: redditRead(shares) }
}
