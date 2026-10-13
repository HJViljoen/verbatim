import { bandVerdict, type Verdict } from '@/lib/reading/verdicts'
import type { MiniBar } from './mini-bars'
import type { PairedBarsProps } from './paired-bars'
import type { ShelfColumn } from './catalogue-shelf'
import type { SlopeRow } from './slope-pair'
import type { SpikeWeek } from './spike-bars'

// The v2 kit's fixtures: Össur-shaped readings for the render tests and the
// kit gallery (scripts/render-kit.tsx). Illustrative, drawn from the depth
// boards' own numbers; no tenant row is read.

const OCT = { kind: 'month' as const, from: '2026-10-01', to: '2026-11-01' }
const SEP = { from: '2026-09-01', to: '2026-10-01' }
const WEEK = { kind: 'week' as const, from: '2026-10-05', to: '2026-10-12' }

/** Cost & access, October so far against September: 22% of 318 against 15%
 *  of 839, outside its band. */
export const MOVED: Verdict = bandVerdict({
  objectKind: 'subject', objectId: 'cost-access', objectLabel: 'Cost & access', audience: 'market',
  window: OCT, basis: SEP, value: { k: 70, n: 318 }, baseline: { k: 126, n: 839 },
})

/** Function & movement: 25% against 25%, inside its band. */
export const NO_CLEAR: Verdict = bandVerdict({
  objectKind: 'subject', objectId: 'function', objectLabel: 'Function & movement', audience: 'market',
  window: OCT, basis: SEP, value: { k: 80, n: 318 }, baseline: { k: 210, n: 839 },
})

/** The anomaly check's flag: insurance refusals, 19 of 241 videos this week
 *  against 39 of 1,906 in the three months before (anomalyVerdict's shape). */
export const WEEK_FLAG: Verdict = {
  objectKind: 'theme', objectId: 'reg-insurance', objectLabel: 'Insurance refusals for powered knees', audience: 'market',
  window: WEEK, basis: { from: '2026-07-01', to: '2026-10-01' },
  value: { k: 19, n: 241 }, baseline: { k: 39, n: 1906 },
  changePts: 5.8, bandPts: 3.6, state: 'moved', flags: [],
}

/** Waterproof knees: no earlier month mentions it. */
export const NEW_FLAG: Verdict = bandVerdict({
  objectKind: 'theme', objectId: 'reg-waterproof', objectLabel: 'Waterproof knees', audience: 'market',
  window: OCT, value: { k: 8, n: 318 }, flags: ['new'],
})

/** Heard in earlier months and not in this one. */
export const GONE_QUIET: Verdict = bandVerdict({
  objectKind: 'theme', objectId: 'reg-cosmesis', objectLabel: 'Foam covers', audience: 'market',
  window: OCT, value: { k: 0, n: 318 }, flags: ['gone_quiet'],
})

/** Three consecutive monthly readings earned a direction word. */
export const GROWING: Verdict = { ...MOVED, objectId: 'reg-liner-life', objectLabel: 'How long a liner lasts', direction: 'growing' }

/** A comparison refused (the grouping changed under it): no chip, whatever
 *  else it carries. */
export const REFUSED: Verdict = bandVerdict({
  objectKind: 'theme', objectId: 'reg-socket', objectLabel: 'Socket fit', audience: 'market',
  window: OCT, basis: SEP, value: { k: 30, n: 318 }, baseline: { k: 60, n: 839 },
  flags: ['new'], refused: 'clustering_changed',
})

/** Insurance refusals, a week at a time, 20 Jul to 5 Oct. */
export const SPIKE_WEEKS: SpikeWeek[] = [
  ['20 Jul', 5], ['27 Jul', 6], ['3 Aug', 7], ['10 Aug', 5], ['17 Aug', 6], ['24 Aug', 6],
  ['31 Aug', 7], ['7 Sep', 5], ['14 Sep', 6], ['21 Sep', 6], ['28 Sep', 7], ['5 Oct', 19],
].map(([label, count]) => ({ label: label as string, count: count as number }))

/** The market's videos a week, 17 Aug to 5 Oct. */
export const VOLUME_WEEKS: SpikeWeek[] = [
  ['17 Aug', 198], ['24 Aug', 205], ['31 Aug', 214], ['7 Sep', 188], ['14 Sep', 230], ['21 Sep', 226], ['28 Sep', 219], ['5 Oct', 241],
].map(([label, count]) => ({ label: label as string, count: count as number }))

/** How long a liner lasts: three weekly counts and no word (decision 1). */
export const THREE_WEEKS: MiniBar[] = [
  { label: '21 Sep', value: 9 },
  { label: '28 Sep', value: 14 },
  { label: '5 Oct', value: 23 },
]

/** Insurance refusals' share of the market's videos, month by month. */
export const MONTHS: MiniBar[] = [
  { label: 'July', value: 2.0, display: '2.0%', sub: '9 of 455' },
  { label: 'August', value: 2.1, display: '2.1%', sub: '13 of 612' },
  { label: 'September', value: 2.3, display: '2.3%', sub: '19 of 839' },
  { label: 'October', value: 9.7, display: '9.7%', sub: 'so far · 31 of 318', filling: true },
]

/** Liners' share of the market, month by month. */
export const LINER_MONTHS: MiniBar[] = [
  { label: 'Aug', value: 12, display: '12%', sub: '73 of 612' },
  { label: 'Sep', value: 14, display: '14%', sub: '117 of 839' },
  { label: 'Oct', value: 16, display: '16%', sub: '52 of 318', filling: true },
]

/** The groups' shares of the market's videos, September and October. */
export const SLOPE_ROWS: SlopeRow[] = [
  { key: 'new-amputees', label: 'New amputees', slot: 'pass_e_persona', from: 31, to: 30 },
  { key: 'long-time', label: 'Long-time users', slot: 'pass_e_persona', from: 21, to: 22 },
  { key: 'active', label: 'Active', slot: 'pass_e_persona', from: 18, to: 18 },
  { key: 'clinicians', label: 'Clinicians', slot: 'pass_e_persona', from: 10, to: 9 },
  { key: 'caregivers', label: 'Caregivers', slot: 'pass_e_persona', from: 9, to: 14 },
]

/** Össur's catalogue, five of its categories. */
export const SHELF: ShelfColumn[] = [
  {
    id: 'liners', name: 'Liners', videos: 52, href: '?group=liners#group-panel',
    products: [
      { id: 'seal-in-x', name: 'Iceross Seal-In X', videos: 6, href: '?product=seal-in-x' },
      { id: 'comfort', name: 'Iceross Comfort', videos: 3, href: '?product=comfort' },
      { id: 'synergy', name: 'Iceross Synergy', videos: 2, href: '?product=synergy' },
      { id: 'seal-in-v', name: 'Iceross Seal-In V', videos: 0, href: '?product=seal-in-v' },
      { id: 'dermo', name: 'Iceross Dermo', videos: 0, href: '?product=dermo' },
      { id: 'sport', name: 'Iceross Sport', videos: 0, href: '?product=sport' },
    ],
    unclear: { count: 11, href: '?group=liners&unclear=1' },
  },
  {
    id: 'feet', name: 'Feet', videos: 44, href: '?group=feet#group-panel',
    products: [
      { id: 'cheetah', name: 'Flex-Foot Cheetah', videos: 9, href: '?product=cheetah' },
      { id: 'pro-flex-xc', name: 'Pro-Flex XC', videos: 5, href: '?product=pro-flex-xc' },
      { id: 'pro-flex-lp', name: 'Pro-Flex LP', videos: 0, href: '?product=pro-flex-lp' },
      { id: 'proprio', name: 'Proprio Foot', videos: 0, href: '?product=proprio' },
      { id: 'vari-flex', name: 'Vari-Flex', videos: 0, href: '?product=vari-flex' },
    ],
    unclear: { count: 6, href: '?group=feet&unclear=1' },
  },
  {
    id: 'knees', name: 'Knees', videos: 38, href: '?group=knees#group-panel',
    products: [
      { id: 'rheo', name: 'Rheo Knee', videos: 7, href: '?product=rheo' },
      { id: 'power', name: 'Power Knee', videos: 4, href: '?product=power' },
      { id: 'navii', name: 'Navii', videos: 3, href: '?product=navii', flag: NEW_FLAG },
      { id: 'mauch', name: 'Mauch Knee', videos: 0, href: '?product=mauch' },
      { id: 'total-knee', name: 'Total Knee', videos: 0, href: '?product=total-knee' },
    ],
    unclear: { count: 5, href: '?group=knees&unclear=1' },
  },
  {
    id: 'bracing', name: 'Bracing & supports', videos: 6, href: '?group=bracing#group-panel',
    products: [
      { id: 'unloader', name: 'Unloader One X', videos: 2, href: '?product=unloader' },
      { id: 'rebound', name: 'Rebound PCL', videos: 0, href: '?product=rebound' },
      { id: 'formfit', name: 'Formfit Knee', videos: 0, href: '?product=formfit' },
    ],
    unclear: { count: 1, href: '?group=bracing&unclear=1' },
  },
  {
    id: 'sockets', name: 'Sockets & suspension', videos: 0, href: '?group=sockets#group-panel',
    products: [
      { id: 'direct', name: 'Direct Socket', videos: 0, href: '?product=direct' },
      { id: 'icelock', name: 'Icelock 200', videos: 0, href: '?product=icelock' },
    ],
    unclear: null,
  },
]

/** What people say about liners, the category against each Össur liner. */
export const PAIRED: Pick<PairedBarsProps, 'rowHeader' | 'columns' | 'rows'> = {
  rowHeader: 'What people say',
  columns: [
    { key: 'all', label: 'All liners', tone: 'market' },
    { key: 'seal-in-x', label: 'Iceross Seal-In X', tone: 'you' },
    { key: 'comfort', label: 'Iceross Comfort', tone: 'you' },
    { key: 'synergy', label: 'Iceross Synergy', tone: 'you' },
  ],
  rows: [
    { key: 'sweat', label: 'Sweat and heat', slot: 'pass_b_theme', cells: [{ k: 19, n: 52 }, { k: 1, n: 6 }, { k: 1, n: 3 }, { k: 0, n: 2 }] },
    { key: 'wear', label: 'Wearing out, losing grip', slot: 'pass_b_theme', cells: [{ k: 18, n: 52 }, { k: 1, n: 6 }, { k: 2, n: 3 }, { k: 0, n: 2 }] },
    { key: 'skin', label: 'Skin irritation', slot: 'pass_b_theme', cells: [{ k: 9, n: 52 }, { k: 0, n: 6 }, { k: 1, n: 3 }, { k: 0, n: 2 }] },
    { key: 'donning', label: 'Hard to put on', slot: 'pass_b_theme', cells: [{ k: 5, n: 52 }, { k: 2, n: 6, highlight: true }, { k: 0, n: 3 }, { k: 0, n: 2 }] },
    { key: 'grip', label: 'Grip praised', slot: 'pass_b_theme', cells: [{ k: 8, n: 52 }, { k: 4, n: 6, highlight: true }, { k: 0, n: 3 }, { k: 1, n: 2 }] },
  ],
}
