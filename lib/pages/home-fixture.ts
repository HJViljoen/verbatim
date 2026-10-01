import type { FigureTable } from '../reports/types'
import type { WeekReadDataV2, WeekReadFinding, WeekReadStanding } from '../written/types'
import type { HomeData } from './home'

// The Dashboard's fixtures (lib/pages/home.test.ts, components/pages/home/
// index.test.tsx): Sealand's September as the approved artboard prints it
// (`Page-Dashboard.dc.html`): 262 videos and 4,528 comments in the week of 21
// to 27 September, 852 and 21,468 in September so far, five ready subjects
// and three that print no figure. Offline; nothing here is read.

const finding = (headline: string): WeekReadFinding => ({
  headline,
  saw: '',
  means: '',
  basedOn: [],
  quote: null,
  videos: { week: 6, month: 22 },
  subjectId: null,
  isNew: false,
  sure: 'reasonable',
  evidence: '',
  context: '',
})

const ready = (name: string, key: string): WeekReadStanding => ({
  subjectId: `s-${key}`,
  sentence: '',
  name,
  calibration: 'ready',
  rung: 'level',
  line: `[[subj_${key}_level]] of [[subj_${key}_n]] videos in your market in September, the biggest subject.`,
  quote: null,
})

const unready = (name: string, calibration: 'failed' | 'provisional'): WeekReadStanding => ({
  subjectId: `s-${name}`, sentence: '', name, calibration, rung: 'none', line: '', quote: null,
})

const level = (key: string, value: string): FigureTable => ({
  [`subj_${key}_level`]: { label: `${key}'s share`, value, kind: 'pct' },
  [`subj_${key}_n`]: { label: 'videos in your market in September', value: '852', kind: 'count' },
})

export const HOME_READ: WeekReadDataV2 = {
  version: 2,
  window: { from: '2026-09-20T04:18:00+00:00', to: '2026-09-27T04:03:00+00:00' },
  month: '2026-09-01',
  headline: 'Buyers are shopping with a shortlist in hand.',
  story: [],
  implications: [],
  newThisWeek: [],
  watch: [],
  findings: [
    finding('Buyers compare bags by exact travel and carry needs'),
    finding('Comfort is judged with weight in the bag'),
    finding('Colour can decide whether someone wants the bag'),
    finding('Repairs come up when a bag is loved'),
  ],
  standing: [
    ready('Buying & delivery', 'buying_delivery'),
    ready('Looks & style', 'looks_style'),
    ready('Comfort', 'comfort'),
    ready('Durability', 'durability'),
    ready('Price', 'price'),
    unready('Community & purpose', 'failed'),
    unready('Repair & warranty', 'failed'),
    unready('Waterproofing', 'failed'),
  ],
  market: { week: { videos: 262, comments: 4528 }, month: { videos: 852, comments: 21468 } },
  figures: {
    ...level('buying_delivery', '23%'),
    ...level('looks_style', '17%'),
    ...level('comfort', '7%'),
    ...level('durability', '6%'),
    ...level('price', '4%'),
  },
  held: [],
  model: 'fixture',
  costUsd: 0,
  promptVersion: 'week_read_v3',
}

/** The page as the artboard draws it, the week by week chart included (two
 *  settled weeks, as it will be once the week of 5 October has settled). */
export const HOME_DATA: HomeData = {
  numbers: {
    week: { heading: 'This week, 21 to 27 September', videos: '262', comments: '4,528' },
    month: { heading: 'September so far', videos: '852', comments: '21,468' },
  },
  // The week of 28 Sep settled, the week of 5 Oct still filling (drawn faint).
  weeks: {
    columns: [
      { week: '2026-09-28', label: '28 Sep', videos: 281, comments: 4902, settled: true },
      { week: '2026-10-05', label: '5 Oct', videos: 254, comments: 4210, settled: false },
      { week: '2026-10-12', label: '12 Oct', videos: null, comments: null, settled: false },
      { week: '2026-10-19', label: '19 Oct', videos: null, comments: null, settled: false },
      { week: '2026-10-26', label: '26 Oct', videos: null, comments: null, settled: false },
      { week: '2026-11-02', label: '2 Nov', videos: null, comments: null, settled: false },
      { week: '2026-11-09', label: '9 Nov', videos: null, comments: null, settled: false },
      { week: '2026-11-16', label: '16 Nov', videos: null, comments: null, settled: false },
    ],
    maxVideos: 281,
    maxComments: 4902,
  },
  tiles: [
    {
      key: 'overview', title: 'Your market', href: '/dashboard/overview', big: '852', sub: 'videos in September',
      rows: [
        { kind: 'bar', label: 'Buying & delivery', copy: null, pct: 23, value: '23%' },
        { kind: 'bar', label: 'Looks & style', copy: null, pct: 17, value: '17%' },
        { kind: 'bar', label: 'Comfort', copy: null, pct: 7, value: '7%' },
      ],
    },
    {
      key: 'week', title: 'This week', href: '/dashboard/week', big: '4', sub: 'findings, 21 to 27 September',
      rows: [
        { kind: 'text', label: 'Buyers compare bags by exact travel and carry needs', copy: 'finding', value: '' },
        { kind: 'text', label: 'Comfort is judged with weight in the bag', copy: 'finding', value: '' },
        { kind: 'text', label: 'Colour can decide whether someone wants the bag', copy: 'finding', value: '' },
      ],
    },
    {
      key: 'voice', title: 'Conversation', href: '/dashboard/voice', big: '40', sub: 'conversations this week',
      rows: [
        { kind: 'bar', label: 'Ready to buy the bag', copy: 'theme', pct: 11, value: '11%' },
        { kind: 'bar', label: 'Questions about shipping and availability', copy: 'theme', pct: 4, value: '4%' },
        { kind: 'bar', label: 'Curiosity about featured product details', copy: 'theme', pct: 3, value: '3%' },
      ],
    },
    { key: 'competitive', title: 'Competitive', href: '/dashboard/competitive', big: '9', sub: 'brands you track', rows: [] },
    {
      key: 'subjects', title: 'Subjects', href: '/dashboard/subjects', big: '8', sub: 'subjects you follow',
      rows: [
        { kind: 'text', label: 'Biggest this month', copy: null, value: 'Buying & delivery, 23%' },
        { kind: 'text', label: 'Added most recently', copy: null, value: 'Buying & delivery, 24 Sep' },
      ],
    },
    {
      key: 'market', title: 'Your moves', href: '/dashboard/market', big: '25', sub: 'posts published in September',
      rows: [
        { kind: 'text', label: 'Moves worth considering', copy: null, value: '5' },
        { kind: 'text', label: 'Moves you dated', copy: null, value: 'none yet' },
      ],
    },
  ],
}
