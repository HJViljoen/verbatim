import type { ObjectReading } from '../../agent/movement'
import { bandVerdict, type Verdict } from '../../reading/verdicts'
import type { MonthSeries } from '../../reading/series'
import { WEEKS_FAILED, type HomeWeeks } from '../home'
import { notReadyIds } from '../subject-place'
import type { UnusualFlag } from '../week'
import {
  buildConvs, buildKinds, buildSubjectBoard, buildSubjectPanel, buildTable, convEvidenceOf, convGroupsOf, convHref, convPageOf, convSiblingsOf, conversationCrumbs, flagCardOf, flagVerdict, groupsOf, insideConvsOf, insideOf, insightThemes, CONV_EVIDENCE_UNREAD,
  lineBars, marketLongRunFor, marketMonths, marketParams, monthsText, ourReadOf, panelStats, pickHero, pickWeekSides, platformRows, subjectCardsOf, subjectCrumbs, subjectHref,
  subjectDetailOf, subjectNavOf, subjectTableHref, subjectWeekLevel, tableMonths, weekWindows, convOf, doingOf, alsoTalkedOf, earlierNewOf, leadDoing, weekCardOf, weekCrumbs, weekPageOf, withMonthPlatforms,
  type ConvEvidence, type ConvEvidenceRow, type ConvInput, type ConvPanel, type ConvVideoRow, type MarketConv, type MarketData, type MarketMonth, type MarketParams, type MarketWeek, type MonthCount,
  type SubjectDetail, type SubjectFact, type TopRow,
} from './market'
import { OSSUR_SUBJECT_READS, SEALAND_SUBJECT_READS } from './market-reads-fixture'
import type { DatedEvidence } from '../../written/evidence'
import type { LongRunReadData, WeekReadData } from '../../written/types'
import type { PublishedWeekRead } from '../../written/published'
import { weekReadDates } from '../../reports/weekly-read'
import type { GroupEvidence, ThemeMonthLine } from '../../reading/cross'
import { cleanQuote } from '../../quotes'
import { quoteTextHash } from '../../quote-text'

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

/** Each conversation's own one-line description (Pass B's), as its page
 *  reads it: the F3 boards' words for the liner and sweat conversations,
 *  illustrative for the rest. */
export const FIXTURE_DESCRIPTIONS: Record<number, string> = {
  1: 'People share how long their liners last before they lose grip, and when to replace one.',
  2: 'Heat and sweat inside the liner, and what people use to stay dry.',
  3: 'Appeals, letters from a prosthetist and the knee insurers will not pay for.',
  7: 'A socket that fitted well starts to feel loose or tight as the limb changes.',
  17: 'How people keep a liner clean, and what they do about the smell.',
}

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

/** Össur's week read as `week_read_v4` wrote it for the week of 5 Oct (the
 *  real words of the 16 Oct offline run, `ossur-week-read-v4e-offline.json`):
 *  the week in one line, what happened, what it means, worth watching. */
export const OSSUR_WEEK = {
  line: 'Prosthetic stories this week turn practical only when people can trust the footage and picture using the limb themselves.',
  story: [
    'The week\'s talk treats prosthetic clips as things to verify and understand, not just stories to admire. Athletic performances and personal journeys still draw praise for courage and skill, but people also ask how the limb works, why it is or is not worn in a sport, and whether long walks hurt. Some stop earlier and question whether the footage is genuine at all, pointing to a missing arm or limb that seems to appear and disappear.',
    'Once viewers can picture the prosthesis as real and usable, the conversation turns to getting it. People ask who makes it, where the clinic is, how to order a similar device or leg cover, and what to do when a limb is in repair. Interest also comes with activity plans, such as hiking or walking, where people want to know which kind of prosthesis exists for that use.',
    'Style and encouragement still matter, but they do not end the conversation. People praise a leg for looking natural, cool or like part of the wearer\'s identity, and they admire the person wearing it. What sits beside that praise is a check on the limb itself: can people understand it, trust the footage, and tell how to get it.',
  ],
  means: [
    'Shoes are part of how a prosthetic foot is judged. Buyers ask how the foot works inside the shoe and whether pain shows up after time walking.',
    'A second prosthesis appears as continuity of use, not an extra feature. People who depend on a limb think about repairs and time without it when they ask how to get one.',
    'Insurance and low-cost builds shape what available means in this market. Buyers name denials, paperwork and bike-part limbs when they talk about getting a prosthesis they can use.',
  ],
  watch: [
    'Whether viewers who doubt athlete clips keep naming limb inconsistencies over the story itself',
    'Whether questions about how a prosthesis works keep centring on shoes, long walks and sport use',
  ],
} as const

/** The quotes the read's story carries, after its first and second
 *  paragraphs, as stored refs (`text: ''`; the words resolve at render). */
const STORY_QUOTES = [
  { ref: 'e:00000000-0000-4000-8000-00000000e001', text: '' as const, date: '2026-10-09', platform: 'youtube', thread: null },
  { ref: 'e:00000000-0000-4000-8000-00000000e002', text: '' as const, date: '2026-10-09', platform: 'instagram', thread: null },
]

/** Their words, as `hydrateData` resolves them (illustrative). */
export const STORY_QUOTE_WORDS = [
  'Watching her sprint on that blade made me cry. Two years ago I couldn’t walk to my mailbox.',
  'Insurance covered the leg but not the liners. Nobody warned us.',
]

/** The published read's parts the page uses. */
export function fixtureRead(): WeekReadData {
  return {
    version: 2,
    promptVersion: 'week_read_v4',
    window: WINDOW,
    month: OCT,
    headline: OSSUR_WEEK.line,
    story: OSSUR_WEEK.story.map((body, i) => ({ body, basedOn: [], quote: STORY_QUOTES[i] ?? null })),
    implications: OSSUR_WEEK.means.map((body) => ({ body, basedOn: [] })),
    newThisWeek: [
      { themeId: id(11), body: 'Swimmers asking whether a knee can go in a pool or the shower.', videos: { week: 8, month: 8 }, evidence: '' },
      { themeId: id(17), body: 'How to keep a liner from smelling.', videos: { week: 5, month: 5 }, evidence: '' },
    ],
    watch: OSSUR_WEEK.watch.map((body) => ({ body, basedOn: [id(3)] })),
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

/** The read as `hydrateData` hands it back: each story quote with its words. */
export function hydratedFixtureRead(read: WeekReadData = fixtureRead()): WeekReadData {
  if (read.version !== 2) return read
  return { ...read, story: read.story.map((p, i) => (p.quote ? { ...p, quote: { ...p.quote, text: STORY_QUOTE_WORDS[i] ?? '' } as never } : p)) }
}

/** The published read as the loader holds it. */
export function fixturePublishedRead(read: WeekReadData = fixtureRead()): PublishedWeekRead {
  return { runId: 'run-2026-10-11', month: OCT, windowEnd: read.window.to, data: read }
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

/** F2-Market-States' six: four ready, one open, one failed. */
const STATES: Record<string, 'ready' | 'provisional' | 'failed'> = { fit: 'ready', cost: 'ready', choosing: 'ready', look: 'ready', function: 'provisional', community: 'failed' }

/**
 * The subjects in a thinner state (the parity pass, 13 Oct): `provisional`,
 * every check still open (Össur today: no level, no line, no change; the
 * conversations inside each still listed); `one_month`, each read for this
 * month only (Sealand today: a level, no line to speak of, no change);
 * `tracked` (14 Oct, a tracked subject is never hidden): Fit & comfort ready,
 * Look & style ready and thin (4 of 318), Cost & access's check open,
 * Community & encouragement's check failed.
 */
export function fixtureFactsIn(state: 'provisional' | 'one_month' | 'tracked' | 'states' | 'unread'): SubjectFact[] {
  if (state === 'unread') {
    // Össur on 17 Oct: every check passed and none read in October yet, so
    // no level and no verdict; the earlier months keep their line.
    return fixtureFacts().flatMap((f): SubjectFact[] => (f.calibration === 'failed' ? [] : [{
      ...f, calibration: 'unread', level: null, verdict: null, trail: f.trail.filter((t) => t.month !== OCT),
    }]))
  }
  if (state === 'states') {
    // F2-Market-States: Function & movement's check open, Community &
    // encouragement's failed, the other four ready.
    return fixtureFacts().flatMap((f): SubjectFact[] => {
      const key = f.id.slice('subj-'.length)
      if (key === 'sport') return []
      if (key === 'function') return [{ ...f, calibration: 'provisional', level: null, verdict: null, trail: [] }]
      if (key === 'community') return [{ ...f, calibration: 'failed', level: null, verdict: null, trail: [] }]
      return [f]
    })
  }
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
  /** Nothing was first heard this week. */
  noNew?: boolean
  /** Who the talk is about: counted (the default), or not counted yet. */
  brands?: MarketData['brands']
  /** The month the view reads has closed (early November, reading October
   *  in full): "October", never "so far". */
  closed?: boolean
  /** The subjects' state: every check passed (the default), every check
   *  still open, read for this month only, the tracked-always four (one
   *  ready, one thin, one open, one failed: `fixtureFactsIn('tracked')`), or
   *  F2-Market-States' six (`fixtureFactsIn('states')`: ready with a
   *  headline, ready with a read stored before headlines, thin, not
   *  measured, failed, and ready with no read this month), or `unread`
   *  (Össur on 17 Oct: every check passed, no subject read in the month yet,
   *  each with its written read: `fixtureFactsIn('unread')`). */
  subjects?: 'ready' | 'provisional' | 'one_month' | 'tracked' | 'states' | 'unread'
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
  /** The subjects' own reads on the published read: `v3` (the default:
   *  Össur's real v3 reads, each written one with its headline), `v2` (the
   *  14 Oct reads, stored before headlines existed: Cost & access written,
   *  Look & style thin), `sealand` (Sealand's real v3 reads under its own
   *  subject names), or `none` (no reads written yet). */
  subjectReads?: 'v3' | 'v2' | 'sealand' | 'none'
  /** The tenant's subject reads are switched off (`subjectReadsEnabled`):
   *  no stored read prints, the week read's sentence stands in. */
  subjectReadsOff?: boolean
  /** The week card's read: written (the default), thin (nothing to print),
   *  or one that could not be read. */
  week?: 'ready' | 'thin' | 'failed'
  /** The week read stored before `week_read_v3`: an In short, no
   *  implications. */
  v1Read?: boolean
  /** A subject's page: its week on the level's base could not be read (the
   *  window read failed, or answered no row). */
  subjectWeek?: 'unread'
  /** A conversation's page: its videos could not be read (`unread`), or it
   *  has none in the period (`none`). */
  convEvidence?: 'unread' | 'none'
  /** A conversation's page: `?video=` (a fixture video's number, 1 to 23)
   *  and `?videos=all`. */
  convVideo?: number
  convVideos?: 'all'
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
  // The read's own words for its window, as the loader writes them.
  dates: weekReadDates(WINDOW),
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
function trackedPlacement(all: NonNullable<ConvInput['subjects']>, checks: Record<string, 'ready' | 'provisional' | 'failed'>): NonNullable<ConvInput['subjects']> {
  const tier = (keep: (check: string) => boolean) => {
    const order = all.order.filter((sid) => keep(checks[sid.slice('subj-'.length)] ?? ''))
    const subjectsOf = new Map<string, string[]>()
    for (const [ins, list] of all.subjectsOf) {
      const kept = list.filter((sid) => order.includes(sid))
      if (kept.length > 0) subjectsOf.set(ins, kept)
    }
    return { order, subjectsOf }
  }
  const ready = tier((c) => c === 'ready')
  return {
    names: new Map([...all.names].filter(([sid]) => checks[sid.slice('subj-'.length)] != null)),
    order: ready.order, subjectsOf: ready.subjectsOf, pending: tier((c) => c === 'provisional'), failed: tier((c) => c === 'failed'),
  }
}

/** The fixture's subject reads, by the option (`FixtureOptions.subjectReads`). */
function readsFor(opts: FixtureOptions, read: WeekReadData): WeekReadData {
  const which = opts.subjects === 'states' ? 'states' : opts.subjectReads ?? 'v3'
  if (which === 'none') return read
  if (which === 'v2') return withSubjectReads(read)
  if (which === 'states') return withStatesReads(read)
  return withSubjectReadsV3(read, which === 'sealand' ? 'sealand' : 'ossur')
}

/** The week's read the fixture holds, by the option. */
function weekReadFor(opts: FixtureOptions): WeekReadData {
  const read = fixtureRead()
  if (opts.v1Read) return { ...read, version: 1, inShort: 'Insurance refusals were the talk of the week, and liners came up all week.', promptVersion: 'week_read_v2' } as unknown as WeekReadData
  if (opts.week === 'thin' && read.version === 2) return { ...read, headline: '', implications: [], story: [] }
  return read
}

/** Every part the pages are built from, assembled by the page's own
 *  builders as the loader assembles them. */
function fixtureCore(opts: FixtureOptions) {
  const period = opts.period ?? 'week'
  const flagged = opts.flagged ?? true
  const month = opts.closed ? MONTH_CLOSED : MONTH
  const soFar = !opts.closed
  const raw: Record<string, string> = {}
  if (period !== 'week') raw.period = period
  const p: MarketParams = marketParams(raw)
  const base = fixtureConvInput(period)
  // Every check open: the subjects place conversations only as the second
  // tier (`placeSubject`), as the loader hands them.
  const pendingTier = opts.subjects === 'provisional' && base.subjects
    ? { ...base.subjects, order: [] as string[], subjectsOf: new Map<string, string[]>(), pending: { order: base.subjects.order, subjectsOf: base.subjects.subjectsOf } }
    : opts.subjects === 'tracked' && base.subjects ? trackedPlacement(base.subjects, TRACKED)
      : opts.subjects === 'states' && base.subjects ? trackedPlacement(base.subjects, STATES) : base.subjects
  const named = opts.subjectReads === 'sealand' && pendingTier
    ? { ...pendingTier, names: new Map([...pendingTier.names].flatMap(([sid]) => { const name = SEALAND_NAMES[sid.slice('subj-'.length)]; return name ? [[sid, name] as [string, string]] : [] })) }
    : pendingTier
  const input = { ...base, subjects: named, ...(opts.noNew ? { newIds: new Set<string>(opts.flagNew ? [id(11)] : []) } : {}) }
  const convs = buildConvs(input).map((c) => withWho(c, period))
  const read = readsFor(opts, weekReadFor(opts))
  const theFlag = opts.flagKind ? FIXTURE_KIND_FLAG : opts.flagNew ? { ...FIXTURE_FLAG, objectId: id(11), label: 'Waterproof knees' } : FIXTURE_FLAG
  const flag = (flagged || opts.flagKind || opts.flagNew) && period === 'week' ? flagCardOf({ flag: theFlag, window: WINDOW, convs, convInput: input, monthCategory: MONTH.category, p, noun: null }) : null
  const flagOn = flag?.conv ? { id: flag.conv.id, verdict: flag.verdict } : null
  const sealand = opts.subjectReads === 'sealand'
  const facts0 = !opts.subjects || opts.subjects === 'ready' ? fixtureFacts().filter((f) => f.calibration !== 'failed') : fixtureFactsIn(opts.subjects)
  // Sealand's five under its own names, over the fixture's subjects.
  const facts = sealand
    ? facts0.flatMap((f) => { const name = SEALAND_NAMES[f.id.slice('subj-'.length)]; return name ? [{ ...f, name }] : [] })
    : facts0
  const board = buildSubjectBoard({
    facts, month: OCT, convs, period, flag: flagOn,
    convHref: (cid) => convHref(p, cid), subjectHref: (sid) => subjectHref(p, sid), soFar,
  })
  const readsOn = !opts.subjectReadsOff
  const subjectNav = subjectNavOf({ rows: board?.rows ?? [], read, month: OCT, readsOn, href: (sid) => subjectHref(p, sid) })
  const base0: MarketData = {
    brand: 'Össur',
    noun: null,
    period,
    weekUnavailable: false,
    params: p,
    week: period === 'week' ? WEEK : null,
    month,
    top: { hero: null, sides: [], months: null },
    subjects: board,
    rail: { kinds: null, weeks: null, platforms: null },
    table: null,
    brands: opts.brands ?? 'counted',
    longRun: null,
    longRunUnread: false,
  }
  return { opts, period, flagged, month, soFar, p, input, convs, read, flag, flagOn, facts, board, readsOn, subjectNav, base: base0 }
}

/** Market's top page as the route would hand it to the page. */
export function marketFixture(opts: FixtureOptions = {}): MarketData {
  const core = fixtureCore(opts)
  const { period, p, input, convs, read, flag, board, soFar, month } = core
  const groups = (cid: string) => (opts.noGroups ? [] : groupsOf(cid, PERSONAS))
  const doing = (c: MarketConv | null) => (c ? leadDoing(doingOf(HERO_KINDS, c.month, null), c.kind) : null)

  const top: TopRow = { hero: null, sides: [], months: null }
  if (period === 'week') {
    // The loader's rule: "Also this week" names no group and no "doing".
    const pick = pickHero({ convs, flag, setApart: new Set() })
    const heroId = flag ? flag.conv?.id ?? null : pick && pick.kind !== 'flag' ? pick.conv.id : null
    if (flag) top.hero = { kind: 'flag', card: { ...flag, conv: convs.find((c) => c.id === flag.conv?.id) ?? flag.conv }, groups: [], doing: null }
    else if (pick && pick.kind !== 'flag') top.hero = { kind: pick.kind, conv: pick.conv, href: convHref(p, pick.conv.id), groups: [], doing: null }
    const sides = pickWeekSides({ convs, heroId, setApart: new Set() })
    // The loader's rule: the board's three cards, always.
    top.sides.push(sides.biggest
      ? { kind: 'biggest', convs: [sides.biggest], hrefs: [convHref(p, sides.biggest.id)], groups: [] }
      : { kind: 'biggest', convs: [], hrefs: [], groups: [] })
    if (sides.fresh.length > 0) {
      top.sides.push({ kind: 'new_list', convs: sides.fresh, hrefs: sides.fresh.map((c) => convHref(p, c.id)), groups: [] })
    } else {
      const anyNew = convs.some((c) => c.isNew)
      const onRow = new Set([heroId, sides.biggest?.id].filter((x): x is string => x != null))
      const earlier = !anyNew && opts.earlierNew ? earlierNewOf([{ window: PREV_WINDOW, themeIds: [id(16)] }], input, (cid) => convHref(p, cid), onRow) : null
      const next = earlier ? null : alsoTalkedOf(convs, onRow, new Set())
      top.sides.push({
        kind: 'new_list', convs: [], hrefs: [], groups: [], anyNew, earlier,
        also: next ? { conv: next, href: convHref(p, next.id) } : null,
      })
    }
  } else if (period === 'month') {
    const [first, ...rest] = convs.slice(0, 3)
    top.hero = { kind: 'biggest', conv: first, href: convHref(p, first.id), groups: groups(first.id), doing: doing(first) }
    for (const c of rest) top.sides.push({ kind: 'month', convs: [c], hrefs: [convHref(p, c.id)], groups: groups(c.id) })
  } else {
    top.months = marketMonths(new Map([['2026-05-01', { videos: 262 }], ['2026-06-01', { videos: 331 }], ['2026-07-01', { videos: 455 }], ['2026-08-01', { videos: 612 }], [SEP, { videos: 839 }], [OCT, { videos: 318 }]]), OCT, OCT)
  }

  const table = buildTable({
    convs, params: p,
    pending: notReadyIds(input.subjects),
    months: period === 'time' ? tableMonths(OCT, new Map([['2026-07-01', 455], ['2026-08-01', 612], [SEP, 780], [OCT, 300]]), OCT) : [],
  })
  return {
    ...core.base,
    view: 'top',
    top,
    rail: {
      kinds: buildKinds(fixtureKindReadings(), OCT, null, soFar),
      weeks: !opts.weeks || opts.weeks === 'drawn' ? FIXTURE_WEEKS : opts.weeks === 'failed' ? WEEKS_FAILED : null,
      weeksAxis: FIXTURE_WEEKS.columns.map((c) => c.label),
      platforms: period === 'week'
        ? withMonthPlatforms(platformRows({ tiktok: 128, instagram: 76, youtube: 37 }, 'week'), { tiktok: 170, instagram: 98, youtube: 50 }, 'in October so far')
        : platformRows({ tiktok: 170, instagram: 98, youtube: 50 }, 'month'),
    },
    table,
    weekCard: period === 'week' ? weekCardOf(opts.week === 'failed' ? 'failed' : fixturePublishedRead(read)) : null,
    subjectCards: subjectCardsOf({ rows: board?.rows ?? [], read, month: OCT, monthText: month.text, readsOn: core.readsOn, href: (sid) => subjectHref(p, sid) }),
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

/** A tracked subject's page (its key: `fit`, `cost`, …), the page's own
 *  builders over the fixture: its read, its blocks (`rich` for a ready
 *  subject on many videos, `thin` for one on a single video; none for a
 *  subject whose check has not passed), the conversations inside it. */
export function marketSubjectFixture(key: string, opts: FixtureOptions & { detail?: 'rich' | 'thin' | null } = {}): MarketData {
  const core = fixtureCore(opts)
  const { period, p, convs, read, flagOn, facts, board, subjectNav, month } = core
  const sid = subjectId(key)
  const fact = facts.find((f) => f.id === sid)
  // Fit & comfort and Cost & access on many videos; any other ready subject
  // on one (the fixture's evidence is written for those two).
  const detailKind = opts.detail === undefined ? (fact?.calibration === 'ready' ? (key === 'fit' || key === 'cost' ? 'rich' : 'thin') : null) : opts.detail
  const panel = buildSubjectPanel({
    id: sid, facts, convs, period, p, read, month, flag: flagOn,
    detail: detailKind ? fixtureSubjectDetail(detailKind, period, month, key === 'fit' ? 'fit' : 'cost') : null,
    readsOn: core.readsOn,
  })
  if (!panel) return { ...core.base, view: 'subject', missing: true, subjectNav, crumbs: subjectCrumbs(p, subjectNav, { id: sid, name: key }).slice(0, 1) }
  const descriptions = new Map(Object.entries(FIXTURE_DESCRIPTIONS).map(([n, d]) => [id(Number(n)), d]))
  const inside = insideConvsOf({ subjectId: sid, convs, descriptions, flag: core.flagOn, href: (cid) => convHref(p, cid) })
  const week = period === 'week' && panel.level ? fixtureSubjectWeek(sid, panel.level, opts.subjectWeek === 'unread') : null
  return {
    ...core.base,
    view: 'subject',
    subjectNav,
    crumbs: subjectCrumbs(p, subjectNav, { id: panel.id, name: panel.name }),
    subjectPage: {
      panel,
      week,
      weeks: period === 'week' && panel.level ? fixtureSubjectWeeks(panel.level, week) : null,
      weekLabels: WEEK.weekLabels,
      prevPct: board?.rows.find((r) => r.id === sid)?.prevPct ?? null,
      inside,
      insideTotal: inside.length,
      allHref: subjectTableHref(p, sid),
    },
  }
}

/**
 * WHAT PEOPLE SAID ON A CONVERSATION'S PAGE (F3-Market-Conversation): its
 * videos in the period (its week's 23, or its month's 35, for How long a
 * liner lasts) as the evidence read returns them, by the page's own builder
 * (`convEvidenceOf`). The first five are the board's creators, captions and
 * comments (one in Spanish with its English); the rest carry a line or two
 * each. Illustrative words, no tenant row read.
 */
const CONV_VIDEOS: [string, string, string, number, string, string[]][] = [
  // account, platform, caption, comments on the video, posted, comments about this
  ['@stepbystep.amp', 'tiktok', 'Three signs your liner is done, and what my clinic never told me about replacing it', 212, '2026-10-03', [
    'This liner gave me a rash after a week and I had to go back to my old one.', 'Mine lasted eight months before it started slipping. Is that normal?', 'Nobody at my fitting said anything about replacing the liner.']],
  ['The Amputee Diaries', 'youtube', 'Your liner has an expiry date. Here’s how to read it.', 96, '2026-09-28', [
    'Does anyone’s liner roll down at the knee by the afternoon?', 'Six months in and the inside of my liner is already thin at the back.', 'My prosthetist said a year. My liner never makes it past seven months.']],
  ['@limbcare.clinic', 'instagram', 'We get this question every week: how long should a liner really last?', 41, '2026-10-05', [
    'Is it normal that my liner feels loose after six months? Nobody told me they wear out.', '¿Cada cuánto hay que cambiar el liner? A mí nadie me lo explicó en la clínica.']],
  ['@runningon.carbon', 'instagram', 'Long run on a hot day, and the liner check after mile ten', 58, '2026-10-02', [
    'My liner stops holding by lunchtime in summer when I run.', 'How long does your liner last if you run every day?']],
  ['@firstyear.leg', 'tiktok', 'Month four with my first leg: what changed, and what nobody warned me about', 37, '2026-10-06', [
    'Did your clinic tell you when to get a new liner? Mine didn’t.', 'My liner feels loose by the evening now. My skin can tell.']],
]
const CONV_COUNTS = [14, 11, 9, 6, 5]
export const CONV_SPANISH = { text: CONV_VIDEOS[2][5][1], english: 'How often do you have to change the liner? Nobody explained it to me at the clinic.' }

export function fixtureConvEvidence(n: number, conv: MarketConv | null, period: MarketParams['period'], p: MarketParams, opts: FixtureOptions = {}): ConvEvidence {
  if (opts.convEvidence === 'unread') return CONV_EVIDENCE_UNREAD
  const total = opts.convEvidence === 'none' ? 0 : (period === 'week' ? conv?.week : conv?.month) ?? 0
  const videos: ConvVideoRow[] = []
  const evidence: ConvEvidenceRow[] = []
  const vid = (i: number) => `00000000-0000-4000-8000-${String(5000 + n * 100 + i).padStart(12, '0')}`
  for (let i = 0; i < total; i++) {
    const board = n === 1 ? CONV_VIDEOS[i] : undefined
    const count = n === 1 && i < CONV_COUNTS.length ? CONV_COUNTS[i] : Math.max(1, 5 - Math.floor(i / 3))
    videos.push({
      id: vid(i + 1), platform: board?.[1] ?? ['tiktok', 'instagram', 'youtube'][i % 3], video_id: `cv${n}-${i + 1}`,
      video_url: `https://example.com/v/${n}-${i + 1}`, account_name: board?.[0] ?? `@creator${i + 1}`, caption: board?.[2] ?? `Video ${i + 1} about ${conv?.label ?? 'it'}`,
      comments_count: board?.[3] ?? 30 - i, upload_date: board?.[4] ?? `2026-10-0${1 + (i % 6)}`,
      is_client: false, is_competitor: false, competitor_name: null, hashtags: ['amputee'], topics: ['prosthetics'], source: 'discovered',
    })
    for (let j = 0; j < count; j++) {
      const words = board?.[5][j] ?? (j === 0 && n !== 1 ? `People ask about ${(conv?.label ?? 'this').toLowerCase()} under video ${i + 1}, and what helps.` : 'Same here.')
      evidence.push({
        evidenceId: `cev-${n}-${i}-${j}`, insightId: `ins-${n}-${1 + (j % 4)}`, commentId: `ccm-${n}-${i}-${j}`, quote: words, rank: j + 1, redacted: false,
        comment: { date: `2026-10-${String(5 + ((i + j) % 6)).padStart(2, '0')}T10:00:00.000Z`, platform: videos[i].platform, videoId: videos[i].video_id, author: `viewer${i}-${j}` },
      })
    }
  }
  const pp: MarketParams = { ...p, video: opts.convVideo ? vid(opts.convVideo) : null, videos: opts.convVideos === 'all' }
  return convEvidenceOf({
    convId: id(n), kind: conv?.kind ?? null, videoIds: videos.map((v) => v.id), commentIds: new Set(evidence.map((e) => e.commentId)),
    members: new Set([1, 2, 3, 4].map((k) => `ins-${n}-${k}`)), videos, evidence,
    translations: new Map([[quoteTextHash(cleanQuote(CONV_SPANISH.text)), { lang: 'es', english: CONV_SPANISH.english }]]),
    named: new Map([[vid(1), ['Össur']], [vid(4), ['Össur']]]), brand: 'Össur', brands: opts.brands ?? 'counted', gate: {}, p: pp,
  })
}

/** A conversation's page (its fixture number): its facts, its three weekly
 *  counts, its videos and what people said, its siblings, and the breadcrumb
 *  under its ready subject (or Market alone). */
export function marketConversationFixture(n: number, opts: FixtureOptions = {}): MarketData {
  const core = fixtureCore(opts)
  const { period, p, convs, input, read, flagged, subjectNav } = core
  const cid = id(n)
  const panel = fixturePanel(n, period, convs, input, read, flagged)
  const conv = convs.find((c) => c.id === cid) ?? convOf(cid, input)
  const ready = conv?.subjectId && core.facts.find((f) => f.id === conv.subjectId)?.calibration === 'ready' ? conv.subjectId : null
  const parent = ready ? { id: ready, name: input.subjects?.names.get(ready) ?? '' } : null
  const siblings = parent
    ? insideOf(parent.id, convs, period, { limit: 50, href: (x) => convHref(p, x) })
    : convs.map((c) => ({ id: c.id, label: c.label, href: convHref(p, c.id) }))
  return {
    ...core.base,
    view: 'conversation',
    subjectNav,
    crumbs: conversationCrumbs({ p, nav: subjectNav, conv: { id: cid, label: panel.label }, parent, siblings }),
    convPage: {
      ...convPageOf(panel, conv, period === 'week' ? WEEK : null, core.month, period),
      lead: panel.description ? { body: panel.description, figures: {} } : null,
      evidence: fixtureConvEvidence(n, conv, period, p, opts),
      siblings: convSiblingsOf({ convId: cid, convs, parent, period, p }),
    },
  }
}

/** The week's page: the published read in full, its quotes resolved. */
export function marketWeekFixture(opts: FixtureOptions = {}): MarketData {
  const core = fixtureCore({ ...opts, period: 'week' })
  const read = core.read
  return {
    ...core.base,
    view: 'week',
    crumbs: weekCrumbs(core.p),
    weekPage: weekPageOf({
      published: opts.week === 'failed' ? 'failed' : fixturePublishedRead(read),
      read: opts.week === 'failed' ? null : hydratedFixtureRead(read),
      conversations: core.convs.length,
      p: core.p,
    }),
  }
}

/** Each group's part of a conversation's talk in the fixture, by its videos
 *  in the period: New amputees on most of "How long a liner lasts" (the
 *  board's 15 of 23), the other groups Pass E links to a conversation on
 *  fewer. */
const GROUP_SHARE: Record<string, number> = { 'new-amputees': 0.65, caregivers: 0.22, 'long-time-users': 0.2, active: 0.3 }

/** A conversation's groups, counted by the page's own builder
 *  (`convGroupsOf`) over citations shaped as the evidence read returns them:
 *  each group Pass E links it to cites some of its videos in the period, and
 *  once on 30 Sep, outside the week and the month, which never counts. */
export function fixtureConvGroups(cid: string, conv: MarketConv, period: MarketParams['period']) {
  const linked = PERSONAS.filter((p) => p.registryIds.includes(cid))
  const n = period === 'week' ? conv.week : conv.month
  const citations: GroupEvidence[] = linked.flatMap((p) => [
    ...Array.from({ length: Math.round((GROUP_SHARE[p.key] ?? 0.1) * (n ?? 0)) }, (_, i) => ({
      insightId: `${p.key}-${cid}`, commentId: `${p.key}-${cid}-c${i}`, platform: 'tiktok', platformVideoId: `${cid}-v${i}`,
      commentDate: `2026-10-${String(5 + (i % 7)).padStart(2, '0')}T10:00:00.000Z`,
    })),
    { insightId: `${p.key}-${cid}`, commentId: `${p.key}-${cid}-early`, platform: 'tiktok', platformVideoId: `${cid}-early`, commentDate: '2026-09-30T10:00:00.000Z' },
  ])
  return convGroupsOf({
    id: cid, label: conv.label, period, month: MONTH, window: WINDOW, citations, n,
    personas: linked.map((p) => ({ ...p, insightIds: [`${p.key}-${cid}`, `${p.key}-elsewhere`] })),
    members: linked.map((p) => `${p.key}-${cid}`),
  })
}

/** The open conversation in full. */
function fixturePanel(n: number, period: MarketParams['period'], convs: readonly MarketConv[], input: ConvInput, read: WeekReadData, flagged: boolean): ConvPanel {
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
  const where = platformRows(conv.mix, period === 'week' ? 'week' : 'month')
  const counted = fixtureConvGroups(cid, conv, period)
  return {
    id: cid,
    label: conv.label,
    kind: conv.kind,
    subjectName: conv.subjectName,
    flag: flagHere ? flagVerdict(flagHere, WINDOW) : null,
    isNew: conv.isNew,
    stats: panelStats({ conv, period, week: period === 'week' ? WEEK : null, month: MONTH, prevK: 19, flag: flagHere, baselineText: flagHere ? monthsText(flagHere.baselineMonths) : null }),
    ourRead: ourReadOf({ id: cid, read, flag: flagHere, description: 'People share how long their liners last before they lose grip, and when to replace one.' }),
    line: { bars, verdict: null, basis: 'the category’s videos' },
    who: conv.who.length > 0 ? { parts: conv.who, n: conv.who.reduce((s, x) => s + x.videos, 0) } : null,
    // What people did, of the period's videos (F3: the rail's "of 23").
    doing: { rows: doingOf(HERO_KINDS, period === 'week' ? conv.week : conv.month, null), n: (period === 'week' ? conv.week : conv.month) ?? 0, text: period === 'week' ? 'this week' : 'in October so far' },
    groups: counted ? counted.groups : groupsOf(cid, PERSONAS),
    groupBase: counted?.base ?? null,
    platforms: where ? { rows: where.rows, n: where.n } : null,
    quotes: n === 1 ? [
      { text: 'Is it normal that my liner feels loose after six months? Nobody told me they wear out.', lang: null, english: null, source: 'Instagram · 6 Oct', about: null },
      { text: 'Does anyone’s liner roll down at the knee by the afternoon?', lang: null, english: null, source: 'YouTube · 9 Oct', about: null },
      { text: 'This liner gave me a rash after a week.', lang: null, english: null, source: 'TikTok · 6 Oct', about: 'client' },
    ] : [
      { text: 'Third appeal denied. They say a mechanical knee is adequate. Adequate for sitting, maybe.', lang: null, english: null, source: 'TikTok · 7 Oct', about: null },
      { text: 'My prosthetist wrote three letters. Still no.', lang: null, english: null, source: 'Instagram · 8 Oct', about: null },
      { text: 'Got the C-Leg approved after a year of fighting. Worth it, but the fight nearly broke me.', lang: null, english: null, source: 'YouTube · 3 Oct', about: 'rival:Ottobock' },
    ],
    askHref: '/dashboard/agent?ask=What%20does%20my%20market%20say%20about%20insurance%20refusals%20for%20powered%20knees%3F',
    description: FIXTURE_DESCRIPTIONS[n] ?? null,
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
const KIND_OF: Record<number, string> = { 1: 'question', 2: 'pain_point', 3: 'pain_point', 6: 'pain_point', 7: 'pain_point', 13: 'question', 15: 'praise', 16: 'question', 17: 'pain_point' }

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
  { ...PERSONAS[1], insightIds: ['ins-13-1', 'ins-6-2', 'ins-16-1', 'ins-2-1', 'ins-2-2'] },
  { ...PERSONAS[2], insightIds: ['ins-1-1', 'ins-1-2', 'ins-7-1', 'ins-7-3'] },
  { ...PERSONAS[3], insightIds: ['ins-17-1'] },
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
export function fixtureSubjectEvidence(kind: 'rich' | 'thin', key: 'cost' | 'fit' = 'cost'): { evidence: DatedEvidence[]; members: Set<string>; namings: { comment_id: string; video_id: string; name: string }[] } {
  if (kind === 'thin') {
    const evidence = [citation({ i: 1, key: 'look', insight: 'ins-15-1', platform: 'instagram', audience: 'industry-other', day: 6, text: 'I love the carbon cover on my leg, people ask about the design and the finish all the time.' })]
    return { evidence, members: new Set([15, 16].flatMap((n) => [1, 2, 3, 4].map((i) => `ins-${n}-${i}`))), namings: [] }
  }
  const memberIds = key === 'fit' ? FIT_MEMBERS : COST_MEMBERS
  const words = key === 'fit' ? FIT_WORDS : COST_WORDS
  const platforms = ['tiktok', 'tiktok', 'instagram', 'youtube']
  const evidence = Array.from({ length: 64 }, (_, i) => citation({
    i,
    key,
    insight: memberIds[i % memberIds.length],
    platform: platforms[i % platforms.length],
    audience: i % 21 === 4 ? 'competitor:Ottobock' : 'industry-other',
    day: 1 + (i % 11),
    text: words[i] ?? 'Same here.',
    redacted: i === 11,
  }))
  // The weeks before October's (the subject's week by week): comments dated
  // in the two weekly windows that open in September, outside the month.
  const before = Array.from({ length: 30 }, (_, i) => ({
    ...citation({ i: 100 + i, key, insight: memberIds[i % memberIds.length], platform: platforms[i % platforms.length], audience: 'industry-other', day: 1, text: 'Same here.' }),
    commentDate: `2026-09-${String(22 + (i % 9)).padStart(2, '0')}T12:00:00.000Z`,
  }))
  const namings = [
    ...evidence.filter((_, i) => i % 10 === 0).map((e) => ({ comment_id: e.commentId, video_id: e.video.uuid, name: 'Össur' })),
    ...evidence.filter((_, i) => i % 13 === 7).map((e) => ({ comment_id: e.commentId, video_id: e.video.uuid, name: 'Ottobock' })),
  ]
  return { evidence: [...evidence, ...before], members: new Set(memberIds), namings }
}

/** Fit & comfort's members and the comments that say something about fit. */
const FIT_MEMBERS = [1, 2, 7, 17].flatMap((n) => [1, 2, 3, 4].map((i) => `ins-${n}-${i}`))
const FIT_WORDS = [
  'Is it normal that my liner feels loose after six months? Nobody told me they wear out.',
  'Summer plus liner equals swamp. What do you all use for the sweat under the socket?',
  'My daughter outgrew her socket in four months. Is that normal for a growing kid?',
  'The new socket finally fits without pressure sores after three castings with my prosthetist.',
  'My liner rolls down at the knee by the afternoon, does anyone have a fix for that?',
  'Long walks are fine now that the socket was adjusted, the sore spot on my shin is gone.',
]

/** The market's videos in the fixture's week, by audience, as
 *  `window_denominators` answers: the category and Ottobock make the 241,
 *  and the client's own posts are not the market. */
const WEEK_DENOMINATORS = [
  { audience: 'industry-other', videos: 226, comments: 3700 },
  { audience: 'competitor:Ottobock', videos: 15, comments: 212 },
  { audience: 'client', videos: 9, comments: 64 },
]

/** A ready subject's week on its level's base, by the page's own builder
 *  (`subjectWeekLevel`) over `window_subject_readings`-shaped rows: its month
 *  share carried to the week's 241 (Fit & comfort's 108 of 318 is the
 *  board's 82 of 241), a few of them Ottobock's, and three of the client's
 *  own posts the pooling leaves out. `unread`: the read answered no row. */
export function fixtureSubjectWeek(sid: string, level: { k: number; n: number }, unread = false) {
  const k = Math.round((level.k / Math.max(1, level.n)) * 241)
  const rival = Math.round(k * 0.07)
  const rows = unread ? [] : [
    { audience: 'industry-other', subject_id: sid, videos: k - rival },
    ...(rival > 0 ? [{ audience: 'competitor:Ottobock', subject_id: sid, videos: rival }] : []),
    { audience: 'client', subject_id: sid, videos: 3 },
  ]
  return subjectWeekLevel({ subjectId: sid, rows, denominators: WEEK_DENOMINATORS, rivalAudiences: ['competitor:Ottobock'] })
}

/** A ready subject's three weeks on its level's base, oldest first: its month
 *  share carried to each window's market (218, 206 and this week's 241; Fit
 *  & comfort's are the board's 74, 70 and 82), the newest `week`'s own, and
 *  null where that read failed. */
export function fixtureSubjectWeeks(level: { k: number; n: number }, week: ReturnType<typeof fixtureSubjectWeek> | null): (number | null)[] {
  const share = level.k / Math.max(1, level.n)
  return [Math.round(share * 218), Math.round(share * 206), week && week !== 'unread' ? week.k : null]
}

/** The open subject's blocks, by the page's own builder: Cost & access or
 *  Fit & comfort on many videos (`rich`), Look & style on one (`thin`). This
 *  week they read the three weekly windows too. */
export function fixtureSubjectDetail(kind: 'rich' | 'thin', period: MarketParams['period'], month: MarketMonth, key: 'cost' | 'fit' = 'cost'): SubjectDetail {
  const { evidence, members, namings } = fixtureSubjectEvidence(kind, key)
  const subject = kind === 'thin'
    ? { id: subjectId('look'), name: 'Look & style', claim: 'Look & style. Comments about how prosthetics look: design, covers and finishes, showing or hiding the device.' }
    : key === 'fit'
      ? { id: subjectId('fit'), name: 'Fit & comfort', claim: 'Fit & comfort. Comments about how a prosthesis fits and feels: the socket, the liner, pressure, sweat and skin, length and alignment.' }
      : { id: subjectId('cost'), name: 'Cost & access', claim: 'Cost & access. Comments about what prosthetic devices cost, insurance, medical aid and funding, and cost or paperwork standing between people and the device they need.' }
  const windows = period === 'week' ? (weekWindows(WINDOW) ?? []).map((w) => ({ ...w, cut: false })) : null
  return subjectDetailOf({
    subjectId: subject.id, name: subject.name, evidence, members, market: new Set(['industry-other', 'competitor:Ottobock']),
    period, week: period === 'week' ? WINDOW : null, month,
    personas: SUBJECT_PERSONAS, namings, brands: 'counted', company: 'Össur', noun: null,
    gate: { claim: subject.claim, requireRelevance: true }, windows,
    conversations: { themeOf: insightThemes(fixtureConvInput(period).themes), href: (cid) => convHref(marketParams(period === 'week' ? {} : { period }), cid) },
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

/** The fixture's subject keys by the subject names the reads are stored
 *  under: Össur's own six, and Sealand's five laid over them. */
const OSSUR_KEYS: Record<string, string> = {
  'Fit & comfort': 'fit', 'Function & movement': 'function', 'Cost & access': 'cost',
  'Community & encouragement': 'community', 'Choosing the right device': 'choosing', 'Look & style': 'look',
}
export const SEALAND_NAMES: Record<string, string> = { fit: 'Comfort', function: 'Buying & delivery', cost: 'Durability', community: 'Looks & style', choosing: 'Price' }

/** The published read with every subject's v3 read on it (Össur's real
 *  ones, or Sealand's under its own names): each written read with its
 *  headline, the thin one with code's line. */
export function withSubjectReadsV3(read: WeekReadData, tenant: 'ossur' | 'sealand' = 'ossur'): WeekReadData {
  if (read.version !== 2) return read
  const keyOf = (name: string): string | null => (tenant === 'ossur' ? OSSUR_KEYS[name] ?? null : Object.entries(SEALAND_NAMES).find(([, n]) => n === name)?.[0] ?? null)
  const reads = tenant === 'ossur' ? OSSUR_SUBJECT_READS : SEALAND_SUBJECT_READS
  return {
    ...read,
    subjectReads: {
      version: 1,
      promptVersion: 'subject_read_v3',
      month: OCT,
      read: { from: `${OCT}T00:00:00.000Z`, to: WINDOW.to },
      status: 'ready',
      model: 'gpt-5.4',
      costUsd: 0.22,
      subjects: reads.flatMap((r) => {
        const key = keyOf(r.name)
        if (!key) return []
        return [{ subjectId: subjectId(key), name: r.name, status: r.status, saying: [...r.saying], means: r.means, ...(r.headline ? { headline: r.headline } : {}), basedOn: [] }]
      }),
    },
  }
}

/** F2-Market-States' reads: Fit & comfort written by v3 (its headline),
 *  Cost & access written before headlines existed, Choosing the right device
 *  thin, Look & style with no read this month. */
export function withStatesReads(read: WeekReadData): WeekReadData {
  const v3 = withSubjectReadsV3(read)
  if (v3.version !== 2 || !v3.subjectReads) return v3
  return {
    ...v3,
    subjectReads: {
      ...v3.subjectReads,
      subjects: v3.subjectReads.subjects
        .filter((r) => r.subjectId !== subjectId('look') && r.subjectId !== subjectId('function') && r.subjectId !== subjectId('community'))
        .map((r) => (r.subjectId === subjectId('cost') ? { ...r, headline: undefined } : r)),
    },
  }
}

/** The same reads written by `subject_read_v3`: Cost & access's written read
 *  carries a headline (16 Oct); the thin one never has one. */
export function withSubjectHeadline(read: WeekReadData, headline: string): WeekReadData {
  if (read.version !== 2 || !read.subjectReads) return read
  return {
    ...read,
    subjectReads: {
      ...read.subjectReads,
      promptVersion: 'subject_read_v3',
      subjects: read.subjectReads.subjects.map((s) => (s.status === 'ready' ? { ...s, headline } : s)),
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
export function marketThinFixture(opts: Pick<FixtureOptions, 'earlierNew'> = {}): MarketData {
  return marketFixture({ flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true, ...opts })
}

/** The fixture's ids, for tests. */
export const fixtureId = id
export const fixtureSubjectId = subjectId

/** The longest conversation label the fixtures draw (the table's and the
 *  breadcrumb's width checks). */
const LONG = 'Whether the forty litre travel backpack really fits under the seat on budget airlines across Europe'

/** The table at its widest (Phase 4 fix round, the 390 check): long labels
 *  and three-digit figures, the week's and the month's, on the first rows. */
export function marketLongRowsFixture(period: 'week' | 'month' = 'week'): MarketData {
  const d = marketFixture({ period })
  const table = d.table!
  return {
    ...d,
    table: {
      ...table,
      rows: table.rows.map((r, i) => (i < 3 ? { ...r, conv: { ...r.conv, label: i === 0 ? LONG : `${LONG} (${i})`, week: 123 + i, month: 456 + i } } : r)),
    },
  }
}

/** A conversation's page under the longest names Market draws (the
 *  breadcrumb's wrap check, 17 Oct): Össur's longest subject, "Community &
 *  encouragement", over the table check's long label. */
export function marketLongCrumbsFixture(): MarketData {
  const d = marketConversationFixture(1)
  const [market, subject, conv] = d.crumbs!
  return {
    ...d,
    crumbs: [market, { ...subject, label: 'Community & encouragement' }, { ...conv, label: LONG }],
    convPage: { ...d.convPage!, panel: { ...d.convPage!.panel, label: LONG, subjectName: 'Community & encouragement' } },
  }
}
