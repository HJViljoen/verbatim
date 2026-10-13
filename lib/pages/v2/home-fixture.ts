import { OSSUR_CLIENT_ID } from '../../config'
import { readingMonthLabel } from '../../reading/month-label'
import type { PublishedWeekRead } from '../../written/published'
import type { StandingFact, WeekReadDataV2 } from '../../written/types'
import { homeWeeksFrame } from '../home'
import { contentHref, IDEAS_EMPTY, recipe, topContentEmpty, type IdeasState, type TopContent } from './content'
import {
  agentTries, weekSubjectsOf, weekTileOf, type DashboardData, type MarketTile, type TileRead, type TopProducts,
} from './home'
import { buildConvs, convHref, flagCardOf, marketParams, pickHero, pickWeekSides, type MarketTop } from './market'
import { FIXTURE_FLAG, FIXTURE_WEEKS, fixtureConvInput, fixtureFacts, fixtureId, fixtureRead } from './market-fixture'
import { adviceHref, movedMove, MOVES_PATH, type TopMoves } from './moves'
import { DESK, MOVE_CARDS } from './moves-fixture'
import { VOICES_HREF, voicesHref, type TopVoices } from './voices'

// THE DASHBOARD'S RENDER FIXTURES (Design v2, T8): Össur-shaped, from the
// other pages' own fixtures (Market's week, Your moves' help desk and its
// moves) and through the pages' own builders (`buildConvs`, `pickHero`,
// `flagCardOf`, `movedMove`, `weekTileOf`, `weekSubjectsOf`, `agentTries`),
// so the render tests exercise what the loader hands the page. One option per
// tile state, so every state each tile can print is drawn. Illustrative: no
// tenant row is read.

const OCT = '2026-10-01'
const SEP = '2026-09-01'
const NOW = '2026-10-13T08:00:00.000Z'

/** Decision 3's two clocks: on 13 October the whole-month tiles read
 *  September, the last full month, beside Market's October so far. */
const SEP_LABEL = readingMonthLabel(SEP, NOW)

/** Market's fixture read, with the week's conversations frozen (T11b). */
export function fixturePublished(): PublishedWeekRead {
  const data = fixtureRead() as WeekReadDataV2
  return {
    runId: 'run-2026-10-11',
    month: OCT,
    windowEnd: data.window.to,
    data: {
      ...data,
      conversations: [
        { registryId: fixtureId(1), label: 'How long a liner lasts', week: 23, month: 35, setApart: false },
        { registryId: fixtureId(3), label: 'Insurance refusals for powered knees', week: 19, month: 31, setApart: false },
        { registryId: fixtureId(2), label: 'Sweat under the liner', week: 21, month: 30, setApart: false },
      ],
    },
  }
}

/** Market's tile, as `topMarket` builds it from the week. */
export function fixtureMarketTop(opts: { flagged?: boolean } = {}): MarketTop {
  const p = marketParams({})
  const input = fixtureConvInput('week')
  const convs = buildConvs(input)
  const card = opts.flagged === false ? null : flagCardOf({ flag: FIXTURE_FLAG, window: fixtureRead().window, convs, convInput: input, monthCategory: 300, p, noun: null })
  const pick = pickHero({ convs, flag: card, setApart: new Set() })
  const hero: MarketTop['hero'] = card
    ? { kind: 'flag', card }
    : pick && pick.kind !== 'flag' ? { kind: pick.kind, conv: pick.conv, href: convHref(p, pick.conv.id, 'top') } : null
  const heroId = card ? card.conv?.id ?? null : pick && pick.kind !== 'flag' ? pick.conv.id : null
  const sides = pickWeekSides({ convs, heroId, setApart: new Set() })
  const rows: MarketTop['rows'] = []
  if (sides.biggest) rows.push({ kind: 'biggest', conv: sides.biggest, href: convHref(p, sides.biggest.id, 'top') })
  if (sides.fresh[0]) rows.push({ kind: 'new', conv: sides.fresh[0], href: convHref(p, sides.fresh[0].id, 'top') })
  return {
    hero,
    rows,
    category: { week: 226, month: 300 },
    week: { dates: '5 to 11 October', inMonth: 'in October so far', labels: ['21 Sep', '28 Sep', '5 Oct'] },
    href: '/dashboard/market',
  }
}

/** Market's subject facts, as the standing reader hands them. */
export function fixtureStanding(): StandingFact[] {
  return fixtureFacts().map((f, i): StandingFact => ({
    subjectId: f.id, name: f.name, calibration: f.calibration as StandingFact['calibration'], level: f.level, rank: f.level ? i + 1 : 0,
    trail: f.trail, verdict: f.verdict, direction: null, rung: f.level ? 'changed' : 'none', contents: [], notes: [], quoteRef: null,
  }))
}

export function fixtureVoicesTop(opts: { named?: boolean; september?: boolean } = {}): TopVoices {
  const groups = [
    { key: 'long-time-users', name: 'Long-time users upgrading', videos: 86 },
    { key: 'new-amputees', name: 'New amputees in their first year', videos: 74 },
    { key: 'active', name: 'Active and athletic users', videos: 51 },
    { key: 'caregivers', name: 'Caregivers and family', videos: 38 },
    { key: 'clinicians', name: 'Clinicians and prosthetists', videos: 22 },
  ]
  return {
    month: opts.september ? SEP : OCT,
    monthWords: opts.september ? 'September' : 'October so far',
    ...(opts.september ? { monthLabel: SEP_LABEL } : {}),
    videos: 318,
    group: { ...groups[0], oneLiner: 'People who have worn a prosthesis for years and want the next one.', href: voicesHref({}, { kind: 'group', key: groups[0].key }) },
    groups,
    named: opts.named === false ? [] : [
      { label: 'Össur', k: 41, n: 318, you: true, href: voicesHref({}, { kind: 'brand', key: 'client' }) },
      { label: 'Ottobock', k: 37, n: 318, you: false, href: voicesHref({}, { kind: 'brand', key: 'Ottobock' }) },
    ],
    groupsState: 'ready',
    groupsEmpty: null,
    brandsState: opts.named === false ? 'not_counted' : 'ready',
    href: VOICES_HREF,
  }
}

/** The catalogue as the board's mini shelf draws it: liners 3 of 8 named,
 *  feet 2 of 9, knees 3 of 6, bracing 1 of 9, sockets none of 6. */
const SHELF: { id: string; name: string; videos: number[] }[] = [
  { id: 'g-liners', name: 'Liners', videos: [9, 4, 1, 0, 0, 0, 0, 0] },
  { id: 'g-feet', name: 'Feet', videos: [7, 3, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'g-knees', name: 'Knees', videos: [6, 4, 3, 0, 0, 0] },
  { id: 'g-bracing', name: 'Bracing', videos: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'g-sockets', name: 'Sockets', videos: [0, 0, 0, 0, 0, 0] },
]

export function fixtureProductsTop(state: TopProducts['state'] = 'ready', opts: { note?: TopProducts['note']; shelf?: boolean; september?: boolean } = {}): TopProducts {
  const href = '/dashboard/products'
  const shelf = opts.shelf === false ? {} : {
    cameUp: SHELF.reduce((n, c) => n + c.videos.filter((v) => v > 0).length, 0),
    products: SHELF.reduce((n, c) => n + c.videos.length, 0),
    columns: SHELF.map((c) => ({ id: c.id, name: c.name, products: c.videos.map((videos, i) => ({ id: `${c.id}-${i}`, videos })) })),
  }
  const words = opts.september ? 'September' : 'October so far'
  const label = opts.september ? { monthLabel: SEP_LABEL } : {}
  if (state !== 'ready') return { state, monthWords: state === 'quiet' ? words : '', ...(state === 'quiet' ? label : {}), standout: null, href, ...(opts.note ? { note: opts.note } : {}) }
  return {
    state,
    monthWords: words,
    ...label,
    standout: { label: 'Named in the most videos', name: 'Pro-Flex Pivot', k: 9, n: 318, href: `${href}?product=p-pivot#product-panel` },
    href,
    ...shelf,
  }
}

export function fixtureContentTop(state: IdeasState | 'older' = 'ready', opts: { medical?: boolean } = {}): TopContent {
  if (state !== 'ready' && state !== 'older') return { state, idea: null, href: '/dashboard/content', line: state === 'unread' ? IDEAS_EMPTY.unread : topContentEmpty(state) }
  const older = state === 'older'
  return {
    state: 'ready',
    idea: {
      rank: 1,
      title: 'How long a liner lasts, and when it is time to replace one',
      week: { k: 23, n: 241 },
      month: { k: 35, n: 318 },
      weekLabel: '5 to 11 Oct',
      monthWords: 'in October so far',
      format: recipe('tutorial', 2.1, 'format'),
      opening: recipe('question', 1.8, 'opening'),
      own: { state: 'none', touched: 0, posts: 25, since: '2026-08-01' },
      medical: opts.medical ?? true,
      ideasWeek: { runId: older ? 'run-2026-10-04' : 'run-2026-10-11', label: older ? '28 Sep to 4 Oct' : '5 to 11 Oct', phrase: 'the week of 28 Sep', current: !older },
    },
    href: contentHref({ period: 'week', open: { kind: 'idea', rank: 1 }, asked: false }),
    line: older ? 'No new ideas this week. These are from the week of 28 Sep.' : null,
  }
}

export function fixtureMovesTop(state: 'full' | 'member' | 'no_advice' | 'no_move' = 'full', opts: { september?: boolean } = {}): TopMoves {
  const move = movedMove(MOVE_CARDS)
  return {
    advice: state === 'no_advice' ? null : {
      lineageId: DESK.lineageId,
      recommendationId: DESK.recommendationId,
      title: DESK.title,
      kind: DESK.kind,
      priority: DESK.priority,
      grounded: DESK.grounded,
      history: DESK.history,
      href: adviceHref(DESK.lineageId),
    },
    waiting: state === 'no_advice' ? 0 : 3,
    move: state === 'no_move' || !move?.compare ? null : {
      id: move.id, title: move.title, kind: move.kind, label: move.label, day: move.day, direction: move.direction,
      compare: move.compare, moved: move.compare.verdict.state === 'moved', href: `${MOVES_PATH}#move-${move.id}`,
    },
    canDecide: state !== 'member',
    ...(opts.september ? { reading: { month: SEP, label: SEP_LABEL } } : {}),
  }
}

const ok = <T,>(top: T): TileRead<T> => ({ state: 'ok', top })
const FAILED = { state: 'failed' } as const

export interface DashboardFixtureOptions {
  /** The anomaly check flagged insurance refusals (default true). */
  flagged?: boolean
  products?: TopProducts['state']
  /** Why a quiet products tile has nothing (`note`). */
  productsNote?: TopProducts['note']
  content?: IdeasState | 'older'
  moves?: 'full' | 'member' | 'no_advice' | 'no_move' | 'none'
  /** Brands named this month (Össur before its back-read has none). */
  named?: boolean
  /** The tiles whose read failed. */
  failed?: readonly ('market' | 'week' | 'voices' | 'products' | 'content' | 'moves')[]
  /** Decision 3's two clocks, as 13 October really reads: Voices, Your
   *  products and Your moves on September, labelled the last full month,
   *  beside Market's and the week's October so far. */
  twoClocks?: boolean
}

/** Össur's Dashboard, the week of 5 October, as the route would draw it. */
export function dashboardFixture(o: DashboardFixtureOptions = {}): DashboardData {
  const read = fixturePublished()
  const failed = new Set(o.failed ?? [])
  const market: TileRead<MarketTile> = ok({ top: fixtureMarketTop({ flagged: o.flagged }), month: OCT, marketWeek: 241 })
  const week = ok(weekTileOf({ read, weeks: FIXTURE_WEEKS, subjects: weekSubjectsOf(fixtureStanding(), OCT, true), now: NOW }))
  return {
    bar: { dates: '5 to 11 October', short: '5 to 11 Oct', asAt: '2026-10-11T07:30:00.000Z', nextUpdate: '2026-10-18T06:00:00.000Z', paused: false },
    market: failed.has('market') ? FAILED : market,
    week: failed.has('week') ? FAILED : week,
    voices: failed.has('voices') ? FAILED : ok(fixtureVoicesTop({ named: o.named, september: o.twoClocks })),
    products: failed.has('products') ? FAILED : ok(fixtureProductsTop(o.products, { note: o.productsNote, september: o.twoClocks })),
    content: failed.has('content') ? FAILED : ok(fixtureContentTop(o.content, { medical: true })),
    moves: failed.has('moves') ? FAILED : ok(o.moves === 'none' ? null : fixtureMovesTop(o.moves ?? 'full', { september: o.twoClocks })),
    agent: { action: '/dashboard/agent', tries: agentTries(read) },
  }
}

/** A workspace before its first update: no read, no week, nothing to lead
 *  with; no catalogue and post ideas not switched on. */
export function dashboardEmptyFixture(): DashboardData {
  return {
    bar: { dates: null, short: null, asAt: null, nextUpdate: '2026-10-18T06:00:00.000Z', paused: false },
    market: ok({ top: null, month: null, marketWeek: null }),
    week: ok(weekTileOf({ read: null, weeks: homeWeeksFrame(NOW), subjects: null, now: NOW })),
    voices: ok(null),
    products: ok(fixtureProductsTop('no_catalogue')),
    content: ok(fixtureContentTop('not_on')),
    moves: ok(null),
    agent: { action: '/dashboard/agent', tries: [] },
  }
}

/** The fixture's day, for a test's clock. */
export const DASHBOARD_NOW = NOW
/** The workspace the medical team line prints for (Össur). */
export const DASHBOARD_CLIENT = OSSUR_CLIENT_ID
