import type { ObjectReading } from '../../agent/movement'
import { bandVerdict, type Verdict } from '../../reading/verdicts'
import type { MonthSeries } from '../../reading/series'
import { WEEKS_FAILED, type HomeWeeks } from '../home'
import { notReadyIds } from '../subject-place'
import type { UnusualFlag } from '../week'
import {
  buildConvs, buildKinds, buildSubjectBoard, buildSubjectPanel, buildTable, convHref, closeHref, flagCardOf, flagVerdict, groupsOf,
  lineBars, marketLongRunFor, marketMonths, marketParams, monthsText, notchOf, ourReadOf, panelStats, pickHero, pickWeekSides, platformRows, subjectHref,
  subjectDetailOf, tableMonths, convOf, doingOf, alsoTalkedOf, earlierNewOf, leadDoing, withMonthPlatforms,
  type ConvInput, type ConvPanel, type MarketConv, type MarketData, type MarketMonth, type MarketParams, type MarketWeek, type MonthCount,
  type PanelAt, type SubjectDetail, type SubjectFact, type TopRow,
} from './market'
import type { DatedEvidence } from '../../written/evidence'
import type { LongRunReadData, WeekReadData } from '../../written/types'
import type { ThemeMonthLine } from '../../reading/cross'

// MARKET'S RENDER FIXTURE (depth v2, T3): an Össur-shaped week, drawn from the
// E2 boards' own numbers and re-cut to decision 1 (no weekly direction words,
// every week figure beside its month, the subjects against last month). The
// page's pure builders assemble it, so the render tests exercise them too.
// Illustrative: no tenant row is read.

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** The conversations: label, kind, subject, the three weekly counts and the
 *  month so far (category videos). */
const THEMES: [number, string, string, string, [number, number, number], number][] = [
  [1, 'How long a liner lasts', 'question', 'fit', [9, 14, 23], 35],
  [2, 'Sweat under the liner', 'pain_point', 'fit', [12, 15, 21], 30],
  [3, 'Insurance refusals for powered knees', 'pain_point', 'cost', [6, 5, 19], 31],
  [4, 'Running-blade stories', 'praise', 'community', [14, 16, 17], 26],
  [5, 'Stairs and slopes', 'question', 'function', [11, 12, 16], 24],
  [6, 'Paying out of pocket', 'pain_point', 'cost', [8, 10, 15], 22],
  [7, 'Socket fit changing over time', 'pain_point', 'fit', [10, 13, 14], 20],
  [8, 'First steps after amputation', 'question', 'community', [9, 11, 13], 19],
  [9, 'Powered knees in daily life', 'praise', 'function', [10, 9, 12], 18],
  [10, 'Which knee for my activity level', 'question', 'choosing', [7, 8, 10], 15],
  [11, 'Waterproof knees', 'question', 'function', [0, 0, 8], 8],
  [12, 'Support from other amputees', 'praise', 'community', [6, 7, 9], 13],
  [13, 'Medical aid and liners', 'question', 'cost', [5, 6, 9], 12],
  [14, 'What my prosthetist recommended', 'question', 'choosing', [6, 7, 8], 12],
  [15, 'Covers and finishes', 'praise', 'look', [4, 5, 7], 10],
  [16, 'Showing it or hiding it', 'question', 'look', [3, 4, 6], 9],
  [17, 'Liner smell and cleaning', 'pain_point', 'fit', [0, 0, 5], 5],
]

const SUBJECTS: [string, string, [number, number], [number, number]][] = [
  // id, name, October so far (k of n), September (k of n)
  ['fit', 'Fit & comfort', [108, 318], [277, 839]],
  ['function', 'Function & movement', [80, 318], [210, 839]],
  ['cost', 'Cost & access', [70, 318], [126, 839]],
  ['community', 'Community & encouragement', [54, 318], [118, 839]],
  ['choosing', 'Choosing the right device', [35, 318], [92, 839]],
  ['look', 'Look & style', [19, 318], [59, 839]],
]

const OCT = '2026-10-01'
const SEP = '2026-09-01'
const WINDOW = { from: '2026-10-05T00:00:00.000Z', to: '2026-10-12T00:00:00.000Z' }

const subjectId = (key: string): string => `subj-${key}`

/** Last month against this one, on the market (`monthChange`'s shape). */
const monthVerdict = (objectKind: 'subject' | 'kind', objectId: string, label: string, now: [number, number], prev: [number, number]): Verdict => bandVerdict({
  objectKind, objectId, objectLabel: label, audience: 'market',
  window: { kind: 'month', from: OCT, to: '2026-11-01' }, basis: { from: SEP, to: OCT },
  value: { k: now[0], n: now[1] }, baseline: { k: prev[0], n: prev[1] },
})

/** The anomaly check's first flag: insurance refusals. */
export const FIXTURE_FLAG: Omit<UnusualFlag, 'quotes'> = {
  objectKind: 'theme',
  objectId: id(3),
  label: 'Insurance refusals for powered knees',
  denominator: 'every audience together',
  week: { k: 19, n: 252 },
  baseline: { k: 39, n: 1906 },
  baselineMonths: ['2026-07-01', '2026-08-01', '2026-09-01'],
  baselineFilling: [],
  baselineRegime: 'one',
  changePts: 5.5,
  bandPts: 2.4,
  sentences: [
    'People describe appeals that drag on for months, with powered knees judged not medically necessary.',
    'Whoever helps people through the paperwork earns their trust before the sale.',
  ],
  explanationModel: 'gpt-5.4',
  rank: 1,
}

/** A flag on a kind of comment (complaints), not a conversation. */
export const FIXTURE_KIND_FLAG: Omit<UnusualFlag, 'quotes'> = {
  ...FIXTURE_FLAG,
  objectKind: 'kind',
  objectId: 'pain_point',
  label: 'pain_point',
  week: { k: 61, n: 252 },
  baseline: { k: 286, n: 1906 },
  sentences: [],
}

/** The published read's parts the page uses. */
export function fixtureRead(): WeekReadData {
  return {
    version: 2,
    promptVersion: 'week_read_v3',
    window: WINDOW,
    month: OCT,
    headline: 'Insurance refusals were the talk of the week.',
    story: [],
    implications: [],
    newThisWeek: [
      { themeId: id(11), body: 'Swimmers asking whether a knee can go in a pool or the shower.', videos: { week: 8, month: 8 }, evidence: '' },
      { themeId: id(17), body: 'How to keep a liner from smelling.', videos: { week: 5, month: 5 }, evidence: '' },
    ],
    watch: [{ body: 'Whether the insurance talk holds once the appeal stories settle.', basedOn: [id(3)] }],
    market: { week: { videos: 241, comments: 3912 }, month: { videos: 318, comments: 5840 } },
    monthComplete: false,
    findings: [{
      headline: 'Insurance refusals for powered knees',
      saw: 'People describe appeals that drag on for months and powered knees judged not medically necessary. Several were told to accept a mechanical knee first and prove they need more.',
      means: 'Access, not the knee itself, is what stands between interest and a fitting.',
      basedOn: [id(3)],
      quote: null,
      videos: { week: 19, month: 31 },
      subjectId: subjectId('cost'),
      isNew: false,
      sure: 'strong',
      evidence: '',
      context: '',
    }],
    standing: [{
      subjectId: subjectId('cost'), sentence: 'People ask how to get a knee paid for, and what to do when a claim is refused.', name: 'Cost & access',
      calibration: 'ready', rung: 'changed', line: '', quote: null,
    }],
    figures: {},
    held: [],
    model: 'gpt-5.4',
    costUsd: 0,
  } as WeekReadData
}

/** The conversations' inputs, as the loader assembles them. */
export function fixtureConvInput(period: MarketParams['period'] = 'week'): ConvInput {
  const themes = new Map(THEMES.map(([n, label, kind]) => [id(n), { label, kind, memberIds: [1, 2, 3, 4].map((i) => `ins-${n}-${i}`) }]))
  const subjectsOf = new Map<string, string[]>()
  for (const [n, , , subject] of THEMES) for (const i of [1, 2, 3, 4]) subjectsOf.set(`ins-${n}-${i}`, [subjectId(subject)])
  const weekCounts = [0, 1, 2].map((w) => {
    const m = new Map<string, { videos: number; mix: Record<string, number> | null }>()
    for (const [n, , , , weeks] of THEMES) {
      const v = weeks[w]
      if (v <= 0) continue
      const tiktok = Math.ceil(v * 0.58)
      const instagram = Math.floor(v * 0.26)
      m.set(id(n), { videos: v, mix: w === 2 ? { tiktok, instagram, youtube: v - tiktok - instagram } : null })
    }
    return m
  })
  const series = new Map<string, MonthSeries>()
  for (const [n, , , , , month] of THEMES) {
    const k = (m: number) => Math.max(0, Math.round(month * m))
    series.set(id(n), {
      objectId: id(n), objectLabel: null, audience: 'industry-other',
      points: [
        { month: '2026-07-01', k: k(0.45), videos: 455, pct: null, state: 'frozen', labels: [] },
        { month: '2026-08-01', k: k(0.6), videos: 612, pct: null, state: 'frozen', labels: [] },
        { month: SEP, k: k(0.9), videos: 780, pct: null, state: 'frozen', labels: [] },
        { month: OCT, k: month, videos: 300, pct: null, state: 'filling', labels: [] },
      ],
      notes: [],
    } as unknown as MonthSeries)
  }
  return {
    period,
    themes,
    subjects: { names: new Map(SUBJECTS.map(([k, name]) => [subjectId(k), name])), order: SUBJECTS.map(([k]) => subjectId(k)), subjectsOf },
    weekCounts,
    weekCut: [false, false, false],
    monthCounts: new Map(THEMES.map(([n, , , , , m]) => [id(n), m])),
    monthMixes: new Map(THEMES.map(([n, , , , , m]) => [id(n), { tiktok: Math.ceil(m * 0.55), instagram: Math.floor(m * 0.3), youtube: m - Math.ceil(m * 0.55) - Math.floor(m * 0.3) }])),
    series: period === 'week' ? new Map() : series,
    month: OCT,
    nowMonth: OCT,
    newIds: new Set([id(11), id(17)]),
    setApart: new Map(),
    pair: null,
  }
}

/** Who each conversation's videos are about (Ottobock and Össur named). */
const WHO: Record<number, [number, number]> = { 1: [4, 0], 2: [2, 0], 3: [3, 5], 4: [6, 2], 5: [3, 3], 6: [0, 2], 9: [3, 4], 10: [2, 2] }
function withWho(c: MarketConv, period: MarketParams['period']): MarketConv {
  const n = Number(c.id.slice(-12))
  const [you, rival] = WHO[n] ?? [0, 0]
  const total = (period === 'week' ? c.week : c.month) ?? 0
  const parts = [
    ...(you ? [{ about: 'client' as const, videos: you }] : []),
    ...(rival ? [{ about: 'rival:Ottobock' as const, videos: rival }] : []),
    ...(total - you - rival > 0 ? [{ about: 'market' as const, videos: total - you - rival }] : []),
  ]
  return { ...c, who: parts }
}

/** The subjects' standing facts, as the readings give them. */
export function fixtureFacts(): SubjectFact[] {
  const facts: SubjectFact[] = SUBJECTS.map(([key, name, now, prev]) => ({
    id: subjectId(key),
    name,
    calibration: 'ready',
    level: { k: now[0], n: now[1] },
    verdict: monthVerdict('subject', subjectId(key), name, now, prev),
    trail: [
      { month: '2026-05-01', k: Math.round(prev[0] * 0.3), n: 260 },
      { month: '2026-06-01', k: Math.round(prev[0] * 0.38), n: 330 },
      { month: '2026-07-01', k: Math.round(prev[0] * 0.52), n: 455 },
      { month: '2026-08-01', k: Math.round(prev[0] * 0.7), n: 612 },
      { month: SEP, k: prev[0], n: prev[1] },
      { month: OCT, k: now[0], n: now[1] },
    ],
  }))
  // A seventh subject whose check failed: named under the rows, never a row.
  facts.push({ id: subjectId('sport'), name: 'Sport and running', calibration: 'failed', level: null, verdict: null, trail: [] })
  return facts
}

/** The four subjects a tracked-always tenant follows (14 Oct): one ready,
 *  one ready and thin, one whose check is open, one whose check failed. The
 *  other two of the six are not followed, so their conversations name no
 *  subject. */
const TRACKED: Record<string, 'ready' | 'provisional' | 'failed'> = { fit: 'ready', look: 'ready', cost: 'provisional', community: 'failed' }

/**
 * The subjects in a thinner state (the parity pass, 13 Oct): `provisional`,
 * every check still open (Össur today: no level, no line, no change; the
 * conversations inside each still listed); `one_month`, each read for this
 * month only (Sealand today: a level, no line to speak of, no change);
 * `tracked` (14 Oct, a tracked subject is never hidden): Fit & comfort ready,
 * Look & style ready and thin (4 of 318), Cost & access's check open,
 * Community & encouragement's check failed.
 */
export function fixtureFactsIn(state: 'provisional' | 'one_month' | 'tracked'): SubjectFact[] {
  if (state === 'tracked') {
    return fixtureFacts().flatMap((f): SubjectFact[] => {
      const key = f.id.slice('subj-'.length)
      const check = TRACKED[key]
      if (!check) return []
      if (check === 'failed') return [{ ...f, calibration: 'failed', level: null, verdict: null, trail: [] }]
      if (check === 'provisional') return [{ ...f, calibration: 'provisional', level: null, verdict: null, trail: [] }]
      if (key !== 'look') return [f]
      // Thin: a small level prints as a small level, never hidden.
      return [{
        ...f,
        level: { k: 4, n: 318 },
        verdict: monthVerdict('subject', f.id, f.name, [4, 318], [7, 839]),
        trail: [{ month: '2026-08-01', k: 5, n: 612 }, { month: SEP, k: 7, n: 839 }, { month: OCT, k: 4, n: 318 }],
      }]
    })
  }
  return fixtureFacts().map((f) => {
    if (f.calibration === 'failed') return f
    if (state === 'provisional') return { ...f, calibration: 'provisional', level: null, verdict: null, trail: [] }
    return { ...f, verdict: null, trail: f.trail.filter((t) => t.month === OCT) }
  })
}

/** The six kinds' readings, October so far against September. */
export function fixtureKindReadings(): ObjectReading[] {
  const rows: [string, [number, number], [number, number]][] = [
    ['question', [143, 318], [369, 839]],
    ['praise', [118, 318], [319, 839]],
    ['pain_point', [102, 318], [227, 839]],
    ['feature_request', [38, 318], [101, 839]],
    ['purchase_intent', [22, 318], [59, 839]],
    ['objection', [19, 318], [50, 839]],
  ]
  return rows.map(([kind, now, prev]) => ({
    object: { kind: 'kind', id: kind, label: kind },
    state: 'read',
    trail: [],
    curr: { month: OCT, k: now[0], n: now[1] },
    prev: { month: SEP, k: prev[0], n: prev[1] },
    verdict: monthVerdict('kind', kind, kind, now, prev),
    direction: null,
    filling: true,
  }))
}

/** The market's weeks, the Dashboard's chart. */
export const FIXTURE_WEEKS: HomeWeeks = {
  columns: [
    ['2026-08-17', '17 Aug', 198, 3110], ['2026-08-24', '24 Aug', 205, 3240], ['2026-08-31', '31 Aug', 214, 3390], ['2026-09-07', '7 Sep', 188, 2980],
    ['2026-09-14', '14 Sep', 230, 3610], ['2026-09-21', '21 Sep', 226, 3550], ['2026-09-28', '28 Sep', 219, 3480], ['2026-10-05', '5 Oct', 241, 3912],
  ].map(([week, label, videos, comments], i) => ({ week: week as string, label: label as string, videos: videos as number, comments: comments as number, settled: i < 7 })),
  maxVideos: 241,
  maxComments: 3912,
}

export interface FixtureOptions {
  period?: MarketParams['period']
  /** The anomaly check flagged insurance refusals. Default true. */
  flagged?: boolean
  /** Open a conversation (by its fixture number) from here. */
  open?: { n: number; at: PanelAt } | null
  /** Open a subject (its key). */
  subject?: string | null
  /** Nothing was first heard this week. */
  noNew?: boolean
  /** Who the talk is about: counted (the default), or not counted yet. */
  brands?: MarketData['brands']
  /** The month the view reads has closed (early November, reading October
   *  in full): "October", never "so far". */
  closed?: boolean
  /** The subjects' state: every check passed (the default), every check
   *  still open, read for this month only, or the tracked-always four (one
   *  ready, one thin, one open, one failed: `fixtureFactsIn('tracked')`). */
  subjects?: 'ready' | 'provisional' | 'one_month' | 'tracked'
  /** The weekly volume: drawn (the default), too few clean weeks, or a read
   *  that failed. */
  weeks?: 'drawn' | 'insufficient' | 'failed'
  /** With nothing first heard this week, an earlier week's read named one
   *  (the third card names it). */
  earlierNew?: boolean
  /** No Voices group lists the lead conversation. */
  noGroups?: boolean
  /** The check flagged a kind of comment (complaints), not a conversation:
   *  the lead card names no group and no "doing". */
  flagKind?: boolean
  /** The week's flag is on a conversation first heard this week (Waterproof
   *  knees), so a New chip sits outside the new card. */
  flagNew?: boolean
  /** This month's long-run read: `full` (written once the month closed),
   *  `partial` (written before it closed, `partialThrough`), `earlier`
   *  (October still filling with none of its own: September's stands in),
   *  `unread` (the read failed), or none. Only the month period prints it. */
  longRun?: 'full' | 'partial' | 'earlier' | 'unread' | null
  /** The open subject's blocks and its own read (14 Oct): `rich` (Cost &
   *  access, a ready subject on many videos, its written read) or `thin`
   *  (Look & style under `subjects: 'tracked'`, ready on one video, code's
   *  one line). Absent: the panel as it was before them. */
  subjectDetail?: 'rich' | 'thin' | null
  /** The tenant's subject reads are switched off (`subjectReadsEnabled`): the
   *  panel prints no stored read, the sentence stands in. */
  subjectReadsOff?: boolean
}

const MONTH: MarketMonth = {
  month: OCT,
  soFar: true,
  text: 'October so far',
  market: { videos: 318, comments: 5840 },
  category: 300,
  prev: { month: SEP, text: 'September', category: 780 },
}

/** October read in full, once it closed. */
const MONTH_CLOSED: MarketMonth = { ...MONTH, soFar: false, text: 'October', market: { videos: 912, comments: 16_204 }, category: 861 }

/**
 * October’s long-run read (`week_reads` kind 'month'; with `sep`, September’s), Össur-shaped and
 * illustrative: what has held across September and October, in the writer's
 * words as the scrub left them (no figure, no direction word), with code's
 * counts. `partialThrough` where it was written before October closed.
 */
export function fixtureLongRun(partialThrough: string | null = null, month: 'oct' | 'sep' = 'oct'): LongRunReadData {
  const read = octoberLongRun(partialThrough)
  if (month === 'oct') return read
  // September's read: its window is August and September.
  const shift = (m: string) => (m === OCT ? SEP : '2026-08-01')
  return {
    ...read,
    month: SEP,
    months: ['2026-08-01', SEP],
    window: { from: '2026-08-01T00:00:00.000Z', to: `${OCT}T00:00:00.000Z` },
    ideas: read.ideas.map((idea) => ({ ...idea, months: idea.months.map((m) => ({ ...m, month: shift(m.month) })) })),
  }
}

function octoberLongRun(partialThrough: string | null): LongRunReadData {
  return {
    version: 1,
    kind: 'longrun',
    promptVersion: 'longrun_read_v1',
    month: OCT,
    months: [SEP, OCT],
    window: { from: `${SEP}T00:00:00.000Z`, to: '2026-11-01T00:00:00.000Z' },
    inShort: 'People want to move freely with less fuss, and what stands in their way is mostly access and everyday comfort rather than the devices themselves.',
    ideas: [
      {
        headline: 'Access, not the device, stands between interest and a fitting',
        body: [
          'People who already want a powered knee talk about refusals, appeals and paperwork long before they talk about the knee itself.',
          'Whoever explains the route to being paid for is listened to first.',
        ],
        basedOn: [id(3), id(6)],
        videos: 64,
        months: [{ month: SEP, videos: 38 }, { month: OCT, videos: 31 }],
        who: [{ about: 'client', videos: 6 }, { about: 'rival:Ottobock', videos: 9 }, { about: 'market', videos: 49 }],
        sure: 'strong',
      },
      {
        headline: 'Liners are where daily comfort is won or lost',
        body: ['Sweat, a loose fit and sore skin are the everyday problems people bring up, and they ask how long a liner should last before it is replaced.'],
        basedOn: [id(1), id(2), id(17)],
        videos: 52,
        months: [{ month: SEP, videos: 30 }, { month: OCT, videos: 27 }],
        who: [{ about: 'rival:Ottobock', videos: 5 }, { about: 'market', videos: 47 }],
        sure: 'strong',
      },
      {
        headline: 'First steps and finish lines draw the warmest talk',
        body: ['Under videos of people walking or running again, the comments are encouragement and shared experience rather than questions about a product.'],
        basedOn: [id(4), id(8)],
        videos: 41,
        months: [{ month: SEP, videos: 25 }, { month: OCT, videos: 19 }],
        who: [{ about: 'client', videos: 4 }, { about: 'market', videos: 37 }],
        sure: 'reasonable',
      },
    ],
    held: [],
    model: 'gpt-5.4',
    costUsd: 0.14,
    ...(partialThrough ? { partialThrough } : {}),
  }
}

/** Two weeks before the fixture's: the earlier read that first heard one. */
const PREV_WINDOW = { from: '2026-09-21T00:00:00.000Z', to: '2026-09-28T00:00:00.000Z' }

const WEEK: MarketWeek = {
  window: WINDOW,
  dates: '5 to 11 Oct',
  month: OCT,
  monthComplete: false,
  inMonth: 'in October so far',
  market: { videos: 241, comments: 3912 },
  category: 226,
  categoryWeeks: [205, 214, 226],
  weekLabels: ['21 Sep', '28 Sep', '5 Oct'],
}

const PERSONAS = [
  { key: 'long-time-users', name: 'Long-time users upgrading', registryIds: [id(3), id(1)] },
  { key: 'caregivers', name: 'Caregivers and family', registryIds: [id(3)] },
  { key: 'new-amputees', name: 'New amputees in their first year', registryIds: [id(1), id(8)] },
  { key: 'active', name: 'Active and athletic users', registryIds: [id(11), id(4)] },
]

const HERO_KINDS = [{ kind: 'pain_point', videos: 14 }, { kind: 'question', videos: 9 }, { kind: 'objection', videos: 4 }]

/** The tracked-always four as the loader places them (`placementTiers`):
 *  the ready ones first, then the open one, then the failed one. */
function trackedPlacement(all: NonNullable<ConvInput['subjects']>): NonNullable<ConvInput['subjects']> {
  const tier = (keep: (check: string) => boolean) => {
    const order = all.order.filter((sid) => keep(TRACKED[sid.slice('subj-'.length)] ?? ''))
    const subjectsOf = new Map<string, string[]>()
    for (const [ins, list] of all.subjectsOf) {
      const kept = list.filter((sid) => order.includes(sid))
      if (kept.length > 0) subjectsOf.set(ins, kept)
    }
    return { order, subjectsOf }
  }
  const ready = tier((c) => c === 'ready')
  return {
    names: new Map([...all.names].filter(([sid]) => TRACKED[sid.slice('subj-'.length)] != null)),
    order: ready.order, subjectsOf: ready.subjectsOf, pending: tier((c) => c === 'provisional'), failed: tier((c) => c === 'failed'),
  }
}

/** Market as the route would hand it to the page. */
export function marketFixture(opts: FixtureOptions = {}): MarketData {
  const period = opts.period ?? 'week'
  const flagged = opts.flagged ?? true
  const month = opts.closed ? MONTH_CLOSED : MONTH
  const soFar = !opts.closed
  const raw: Record<string, string> = {}
  if (period !== 'week') raw.period = period
  if (opts.open) {
    raw.conv = id(opts.open.n)
    raw.at = opts.open.at
  }
  if (opts.subject) {
    raw.subject = subjectId(opts.subject)
    raw.at = 'subjects'
  }
  const p: MarketParams = marketParams(raw)
  const base = fixtureConvInput(period)
  // Every check open: the subjects place conversations only as the second
  // tier (`placeSubject`), as the loader hands them.
  const pendingTier = opts.subjects === 'provisional' && base.subjects
    ? { ...base.subjects, order: [] as string[], subjectsOf: new Map<string, string[]>(), pending: { order: base.subjects.order, subjectsOf: base.subjects.subjectsOf } }
    : opts.subjects === 'tracked' && base.subjects ? trackedPlacement(base.subjects) : base.subjects
  const input = { ...base, subjects: pendingTier, ...(opts.noNew ? { newIds: new Set<string>(opts.flagNew ? [id(11)] : []) } : {}) }
  const convs = buildConvs(input).map((c) => withWho(c, period))
  const read = fixtureRead()
  const theFlag = opts.flagKind ? FIXTURE_KIND_FLAG : opts.flagNew ? { ...FIXTURE_FLAG, objectId: id(11), label: 'Waterproof knees' } : FIXTURE_FLAG
  const flag = (flagged || opts.flagKind || opts.flagNew) && period === 'week' ? flagCardOf({ flag: theFlag, window: WINDOW, convs, convInput: input, monthCategory: MONTH.category, p, noun: null }) : null
  const groups = (cid: string) => (opts.noGroups ? [] : groupsOf(cid, PERSONAS))
  const doing = (c: MarketConv | null) => (c ? leadDoing(doingOf(HERO_KINDS, c.month, null), c.kind) : null)

  const top: TopRow = { hero: null, sides: [], months: null }
  if (period === 'week') {
    const pick = pickHero({ convs, flag, setApart: new Set() })
    const heroId = flag ? flag.conv?.id ?? null : pick && pick.kind !== 'flag' ? pick.conv.id : null
    if (flag) top.hero = { kind: 'flag', card: { ...flag, conv: convs.find((c) => c.id === flag.conv?.id) ?? flag.conv }, groups: groups(flag.flag.objectId), doing: doing(flag.conv) }
    else if (pick && pick.kind !== 'flag') top.hero = { kind: pick.kind, conv: pick.conv, href: convHref(p, pick.conv.id, 'top'), groups: groups(pick.conv.id), doing: doing(pick.conv) }
    const sides = pickWeekSides({ convs, heroId, setApart: new Set() })
    // The loader's rule: the board's three cards, always.
    top.sides.push(sides.biggest
      ? { kind: 'biggest', convs: [sides.biggest], hrefs: [convHref(p, sides.biggest.id, 'top')], groups: groups(sides.biggest.id) }
      : { kind: 'biggest', convs: [], hrefs: [], groups: [] })
    if (sides.fresh.length > 0) {
      top.sides.push({ kind: 'new_list', convs: sides.fresh, hrefs: sides.fresh.map((c) => convHref(p, c.id, 'top')), groups: groups(sides.fresh[0].id) })
    } else {
      const anyNew = convs.some((c) => c.isNew)
      const onRow = new Set([heroId, sides.biggest?.id].filter((x): x is string => x != null))
      const earlier = !anyNew && opts.earlierNew ? earlierNewOf([{ window: PREV_WINDOW, themeIds: [id(16)] }], input, (cid) => convHref(p, cid, 'top'), onRow) : null
      const next = earlier ? null : alsoTalkedOf(convs, onRow, new Set())
      top.sides.push({
        kind: 'new_list', convs: [], hrefs: [], groups: [], anyNew, earlier,
        also: next ? { conv: next, href: convHref(p, next.id, 'top'), groups: groups(next.id) } : null,
      })
    }
  } else if (period === 'month') {
    const [first, ...rest] = convs.slice(0, 3)
    top.hero = { kind: 'biggest', conv: first, href: convHref(p, first.id, 'top'), groups: groups(first.id), doing: doing(first) }
    for (const c of rest) top.sides.push({ kind: 'month', convs: [c], hrefs: [convHref(p, c.id, 'top')], groups: groups(c.id) })
  } else {
    top.months = marketMonths(new Map([['2026-05-01', { videos: 262 }], ['2026-06-01', { videos: 331 }], ['2026-07-01', { videos: 455 }], ['2026-08-01', { videos: 612 }], [SEP, { videos: 839 }], [OCT, { videos: 318 }]]), OCT, OCT)
  }

  const facts = !opts.subjects || opts.subjects === 'ready' ? fixtureFacts() : fixtureFactsIn(opts.subjects)
  const subjects = buildSubjectBoard({
    facts, month: OCT, convs, period,
    flag: flag?.conv ? { id: flag.conv.id, verdict: flag.verdict } : null,
    convHref: (cid) => convHref(p, cid, 'subjects'), subjectHref: (sid) => subjectHref(p, sid), soFar,
  })
  const openId = opts.open ? id(opts.open.n) : null
  const table = buildTable({
    convs, params: p, openId: opts.open?.at === 'table' ? openId : null,
    pending: notReadyIds(input.subjects),
    months: period === 'time' ? tableMonths(OCT, new Map([['2026-07-01', 455], ['2026-08-01', 612], [SEP, 780], [OCT, 300]]), OCT) : [],
  })
  const panel = opts.open ? fixturePanel(opts.open.n, opts.open.at, p, period, convs, input, read, flagged) : null
  return {
    brand: 'Össur',
    noun: null,
    period,
    weekUnavailable: false,
    params: p,
    week: period === 'week' ? WEEK : null,
    month,
    top,
    subjects,
    rail: {
      kinds: buildKinds(fixtureKindReadings(), OCT, null, soFar),
      weeks: !opts.weeks || opts.weeks === 'drawn' ? FIXTURE_WEEKS : opts.weeks === 'failed' ? WEEKS_FAILED : null,
      weeksAxis: FIXTURE_WEEKS.columns.map((c) => c.label),
      platforms: period === 'week'
        ? withMonthPlatforms(platformRows({ tiktok: 128, instagram: 76, youtube: 37 }, 'week'), { tiktok: 170, instagram: 98, youtube: 50 }, 'in October so far')
        : platformRows({ tiktok: 170, instagram: 98, youtube: 50 }, 'month'),
      watch: period === 'week' ? read.version === 2 ? read.watch.map((w) => ({ body: w.body, figures: {} })) : [] : [],
    },
    table,
    panel,
    brands: opts.brands ?? 'counted',
    subjectPanel: opts.subject
      ? buildSubjectPanel({
          id: subjectId(opts.subject), facts, convs, period, p, read: opts.subjectDetail ? withSubjectReads(read) : read, month,
          flag: flag?.conv ? { id: flag.conv.id, verdict: flag.verdict } : null,
          detail: opts.subjectDetail ? fixtureSubjectDetail(opts.subjectDetail, period, month) : null,
          readsOn: Boolean(opts.subjectDetail) && !opts.subjectReadsOff,
        })
      : null,
    // The loader's own rule (`marketLongRunFor`): the month period only, the
    // view's month's read, or on a filling month the newest earlier month's.
    longRun: period === 'month' && opts.longRun && opts.longRun !== 'unread'
      ? marketLongRunFor(opts.longRun === 'earlier'
        ? { own: null, closed: { month: SEP, data: fixtureLongRun(null, 'sep'), created_at: '2026-10-04T05:00:00.000Z' }, month: month.month, filling: month.soFar }
        : { own: { month: OCT, data: fixtureLongRun(opts.longRun === 'partial' ? '2026-10-11' : null), created_at: '2026-11-01T05:00:00.000Z' }, closed: null, month: month.month, filling: month.soFar })
      : null,
    longRunUnread: period === 'month' && opts.longRun === 'unread',
  }
}

/** The open conversation in full. */
function fixturePanel(n: number, at: PanelAt, p: MarketParams, period: MarketParams['period'], convs: readonly MarketConv[], input: ConvInput, read: WeekReadData, flagged: boolean): ConvPanel {
  const cid = id(n)
  const conv = convs.find((c) => c.id === cid) ?? convOf(cid, input)!
  const flagHere = flagged && period === 'week' && FIXTURE_FLAG.objectId === cid ? FIXTURE_FLAG : null
  const line: ThemeMonthLine = {
    themeId: cid, label: conv.label, audience: 'industry-other', month: OCT, verdict: null, notes: [],
    points: [
      ['2026-05-01', 4, 262], ['2026-06-01', 6, 330], ['2026-07-01', 9, 455], ['2026-08-01', 13, 612], [SEP, 19, 780], [OCT, conv.month ?? 0, 300],
    ].map(([month, k, nn]) => ({ month: month as string, state: month === OCT ? 'filling' : 'frozen', k: k as number, n: nn as number, pct: null, clusteringKey: 'c1', regimeStep: 'same', refusedStep: null })) as ThemeMonthLine['points'],
  }
  const bars: MonthCount[] = lineBars(line, OCT)
  return {
    id: cid,
    label: conv.label,
    kind: conv.kind,
    subjectName: conv.subjectName,
    at,
    notchAt: notchOf(at, 0),
    flag: flagHere ? flagVerdict(flagHere, WINDOW) : null,
    isNew: conv.isNew,
    stats: panelStats({ conv, period, week: period === 'week' ? WEEK : null, month: MONTH, prevK: 19, flag: flagHere, baselineText: flagHere ? monthsText(flagHere.baselineMonths) : null }),
    ourRead: ourReadOf({ id: cid, read, flag: flagHere, description: 'People share how long their liners last before they lose grip, and when to replace one.' }),
    line: { bars, verdict: null, basis: 'the category’s videos' },
    who: conv.who.length > 0 ? { parts: conv.who, n: conv.who.reduce((s, x) => s + x.videos, 0) } : null,
    doing: { rows: doingOf(HERO_KINDS, conv.month, null), n: conv.month ?? 0, text: 'in October so far' },
    groups: groupsOf(cid, PERSONAS),
    platforms: platformRows(conv.mix, period === 'week' ? 'week' : 'month')?.rows ? { rows: platformRows(conv.mix, period === 'week' ? 'week' : 'month')!.rows, n: platformRows(conv.mix, period === 'week' ? 'week' : 'month')!.n } : null,
    quotes: [
      { text: 'Third appeal denied. They say a mechanical knee is adequate. Adequate for sitting, maybe.', lang: null, english: null, source: 'TikTok · 7 Oct', about: null },
      { text: 'My prosthetist wrote three letters. Still no.', lang: null, english: null, source: 'Instagram · 8 Oct', about: null },
      { text: 'Got the C-Leg approved after a year of fighting. Worth it, but the fight nearly broke me.', lang: null, english: null, source: 'YouTube · 3 Oct', about: 'rival:Ottobock' },
    ],
    askHref: '/dashboard/agent?ask=What%20does%20my%20market%20say%20about%20insurance%20refusals%20for%20powered%20knees%3F',
    closeHref: closeHref(p, at),
  }
}

// ---- A ready subject's panel (14 Oct) --------------------------------------------------
//
// Cost & access as a ready subject on many videos (`rich`), and Look & style
// as one ready on a single video (`thin`): the members' comment citations in
// October, as `loadDatedEvidence` returns them (one demographic citation
// among them, which counts and never quotes), assembled by the page's own
// builder (`subjectDetailOf`). Illustrative words, no tenant row read.

const COST_MEMBERS = [3, 6, 13].flatMap((n) => [1, 2, 3, 4].map((i) => `ins-${n}-${i}`))
const KIND_OF: Record<number, string> = { 3: 'pain_point', 6: 'pain_point', 13: 'question', 15: 'praise', 16: 'question' }

/** Comments that say something about cost and access, for the quotes. The
 *  rest of the rich fixture's comments are too short to quote. */
const COST_WORDS = [
  'Third appeal for my powered knee was refused. Insurance says a mechanical knee is enough for me.',
  'My insurance covered the socket but not the knee, so the rest of the cost is on us now.',
  'How do you get medical aid to pay for a microprocessor knee? The paperwork never ends.',
  'Got my knee approved by insurance after a year of appeals and letters from my prosthetist.',
  'Paying out of pocket for a liner every few months adds up, and nobody covers it.',
  'The cost of a running blade is more than my car and insurance will not touch it.',
]

const SUBJECT_PERSONAS = [
  { ...PERSONAS[0], insightIds: ['ins-3-1', 'ins-3-2', 'ins-6-1'] },
  { ...PERSONAS[1], insightIds: ['ins-13-1', 'ins-6-2', 'ins-16-1'] },
  { ...PERSONAS[2], insightIds: ['ins-1-1'] },
  { ...PERSONAS[3], insightIds: [] },
]

/** One citation, shaped as the evidence read returns it. */
function citation(o: { i: number; key: string; insight: string; platform: string; audience: string; day: number; text: string; redacted?: boolean }): DatedEvidence {
  const n = Number(o.insight.split('-')[1])
  const videoId = `${o.key}-${o.i}`
  return {
    insightId: o.insight,
    kind: KIND_OF[n] ?? null,
    description: `What people said in ${o.insight}.`,
    evidenceId: `ev-${o.key}-${o.i}`,
    rank: 1,
    commentId: `cm-${o.key}-${o.i}`,
    commentDate: `2026-10-${String(o.day).padStart(2, '0')}T12:00:00.000Z`,
    author: `viewer${o.i}`,
    text: o.redacted ? '' : o.text,
    ...(o.redacted ? { redacted: true } : {}),
    video: { uuid: `vid-${videoId}`, platform: o.platform, videoId, audience: o.audience, lane: 'full', accountName: `creator${o.i}` },
    context: {
      platform: o.platform, videoId, caption: 'Living with a prosthetic leg', hashtags: ['amputee'], topics: ['prosthetics'], accountName: `creator${o.i}`,
      isClient: false, isCompetitor: o.audience !== 'industry-other', competitorName: o.audience.startsWith('competitor:') ? o.audience.slice('competitor:'.length) : null,
      source: 'discovered', segment: 'market',
    },
  }
}

/** Cost & access's October: 64 videos (the level's 70 less those only spoken
 *  on camera), 40 of them in the week of 5 Oct, three filed under Ottobock;
 *  or Look & style's one video. */
export function fixtureSubjectEvidence(kind: 'rich' | 'thin'): { evidence: DatedEvidence[]; members: Set<string>; namings: { comment_id: string; video_id: string; name: string }[] } {
  if (kind === 'thin') {
    const evidence = [citation({ i: 1, key: 'look', insight: 'ins-15-1', platform: 'instagram', audience: 'industry-other', day: 6, text: 'I love the carbon cover on my leg, people ask about the design and the finish all the time.' })]
    return { evidence, members: new Set([15, 16].flatMap((n) => [1, 2, 3, 4].map((i) => `ins-${n}-${i}`))), namings: [] }
  }
  const platforms = ['tiktok', 'tiktok', 'instagram', 'youtube']
  const evidence = Array.from({ length: 64 }, (_, i) => citation({
    i,
    key: 'cost',
    insight: COST_MEMBERS[i % COST_MEMBERS.length],
    platform: platforms[i % platforms.length],
    audience: i % 21 === 4 ? 'competitor:Ottobock' : 'industry-other',
    day: 1 + (i % 11),
    text: COST_WORDS[i] ?? 'Same here.',
    redacted: i === 11,
  }))
  const namings = [
    ...evidence.filter((_, i) => i % 10 === 0).map((e) => ({ comment_id: e.commentId, video_id: e.video.uuid, name: 'Össur' })),
    ...evidence.filter((_, i) => i % 13 === 7).map((e) => ({ comment_id: e.commentId, video_id: e.video.uuid, name: 'Ottobock' })),
  ]
  return { evidence, members: new Set(COST_MEMBERS), namings }
}

/** The open subject's blocks, by the page's own builder. */
export function fixtureSubjectDetail(kind: 'rich' | 'thin', period: MarketParams['period'], month: MarketMonth): SubjectDetail {
  const { evidence, members, namings } = fixtureSubjectEvidence(kind)
  const subject = kind === 'rich'
    ? { id: subjectId('cost'), name: 'Cost & access', claim: 'Cost & access. Comments about what prosthetic devices cost, insurance, medical aid and funding, and cost or paperwork standing between people and the device they need.' }
    : { id: subjectId('look'), name: 'Look & style', claim: 'Look & style. Comments about how prosthetics look: design, covers and finishes, showing or hiding the device.' }
  return subjectDetailOf({
    subjectId: subject.id, name: subject.name, evidence, members, market: new Set(['industry-other', 'competitor:Ottobock']),
    period, week: period === 'week' ? WINDOW : null, month, marketWeek: period === 'week' ? WEEK.market.videos : null,
    personas: SUBJECT_PERSONAS, namings, brands: 'counted', company: 'Össur', noun: null,
    gate: { claim: subject.claim, requireRelevance: true },
  })
}

/** The published read with the subjects' own reads on it, as
 *  `write-subject-reads` adds them: Cost & access written, Look & style thin
 *  (code's line). */
export function withSubjectReads(read: WeekReadData): WeekReadData {
  if (read.version !== 2) return read
  return {
    ...read,
    subjectReads: {
      version: 1,
      promptVersion: 'subject_read_v2',
      month: OCT,
      read: { from: `${OCT}T00:00:00.000Z`, to: WINDOW.to },
      status: 'ready',
      model: 'gpt-5.4',
      costUsd: 0.09,
      subjects: [
        {
          subjectId: subjectId('cost'), name: 'Cost & access', status: 'ready',
          saying: [
            'People describe insurance refusals for powered knees as a long fight: appeals, letters from a prosthetist, and a mechanical knee offered in its place. Parents and partners describe the same paperwork from the other side, as the person who files it.',
            'Paying out of pocket runs through all of it. Liners, sockets and running blades are named as costs that medical aid leaves to the family, and some set up fundraisers when the funding does not come.',
          ],
          means: 'The refusals people describe are for powered knees, the kind of knee Össur sells. Where cover is refused, the appeal and its paperwork stand between a buyer and the knee.',
          basedOn: [id(3), id(6), id(13)],
        },
        {
          subjectId: subjectId('look'), name: 'Look & style', status: 'thin',
          saying: ['In October so far, talk about Look & style sat in “Covers and finishes” and “Showing it or hiding it”.'],
          means: '',
          basedOn: [id(15), id(16)],
        },
      ],
    },
  }
}

/**
 * MARKET AS ÖSSUR HAS IT TODAY (the parity pass, 13 Oct): no flag, nothing
 * first heard this week, every subject's check still open, brands not counted
 * yet, too few clean weeks for the weekly volume, and no Voices group on the
 * lead. The render tests pin the board's shape in this state: three cards in
 * the top row, a row per subject with the conversations inside it, the rail
 * a column beside the board, the weekly chart's frame, and the table's
 * Subject and About columns.
 */
export function marketThinFixture(opts: Pick<FixtureOptions, 'earlierNew' | 'open' | 'subject'> = {}): MarketData {
  return marketFixture({ flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true, ...opts })
}

/** The fixture's ids, for tests. */
export const fixtureId = id
export const fixtureSubjectId = subjectId

/** The table at its widest (Phase 4 fix round, the 390 check): long labels
 *  and three-digit figures, the week's and the month's, on the first rows. */
export function marketLongRowsFixture(period: 'week' | 'month' = 'week'): MarketData {
  const d = marketFixture({ period })
  const LONG = 'Whether the forty litre travel backpack really fits under the seat on budget airlines across Europe'
  const table = d.table!
  return {
    ...d,
    table: {
      ...table,
      rows: table.rows.map((r, i) => (i < 3 ? { ...r, conv: { ...r.conv, label: i === 0 ? LONG : `${LONG} (${i})`, week: 123 + i, month: 456 + i } } : r)),
    },
  }
}
