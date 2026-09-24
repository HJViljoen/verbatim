import { buildQuarterlyCard, type QuarterlyCard, type QuarterlyCardInput } from '@/lib/pages/reports-card'
import type { WindowReading } from '@/lib/reading/read'
import type { SubjectWindowReading } from '@/lib/subjects/types'
import { previousQuarter, quarterFor } from '@/lib/reports/quarterly'
import { INDUSTRY_AUDIENCE } from '@/lib/rivals'

// The quarterly card's fixtures (Block D wave 1, package D7).
//
// THEY GO THROUGH THE REAL BUILDER, the rule the quarterly's own fixtures
// already follow: a fixture that hand-types a card is a second reading of the
// product and the first thing to drift from it.
//
// THREE STATES, AND WAVE 2 HAS TO DRAW ALL THREE, because two of them are what
// a live workspace looks like today:
//   `quarterlyCardFixture()` — nine readings, both windows read: the card the
//                              mock draws.
//   `formingCardFixture()`   — PRODUCTION TODAY on Sealand: three readings, so
//                              every row reads "not enough months yet" and no
//                              date is promised anywhere.
//   `unreadCardFixture()`    — M3/M4 unapplied: the window pair answers null
//                              and the card says the reading is not recorded
//                              rather than adding three months together.

const QUARTER = quarterFor(2026, 3)
const PRIOR = previousQuarter(QUARTER)

const SUBJECTS = [
  { id: 's1', name: 'Durability' },
  { id: 's2', name: 'Price and value' },
  { id: 's3', name: 'Sizing and fit' },
]

const windowRead = (videos: number): WindowReading => ({
  denominators: [
    { audience: INDUSTRY_AUDIENCE, videos, comments: videos * 8, platform_mix: {}, dual_mention: 0, excluded_undated: 0 },
  ],
  themes: [],
})

const subjectWindow = (videos: number, shares: readonly number[]): SubjectWindowReading[] =>
  SUBJECTS.map((s, i) => ({
    audience: INDUSTRY_AUDIENCE,
    subject_id: s.id,
    videos: Math.round(videos * shares[i]),
    comments: 0,
    platform_mix: {},
    excluded_on_camera: 0,
    excluded_undated: 0,
  }))

const base = (over: Partial<QuarterlyCardInput> = {}): QuarterlyCardInput => ({
  quarter: QUARTER,
  prior: PRIOR,
  subjects: SUBJECTS,
  thisQuarter: windowRead(4147),
  lastQuarter: windowRead(3810),
  subjectsNow: subjectWindow(4147, [0.22, 0.14, 0.09]),
  subjectsBefore: subjectWindow(3810, [0.18, 0.15, 0.09]),
  monthsInQuarter: [
    { month: '2026-07-01', videos: 1290, backRead: false },
    { month: '2026-08-01', videos: 1409, backRead: false },
    { month: '2026-09-01', videos: 1448, backRead: false },
  ],
  readings: 9,
  ...over,
})

export function quarterlyCardFixture(over: Partial<QuarterlyCardInput> = {}): QuarterlyCard {
  return buildQuarterlyCard(base(over)) as QuarterlyCard
}

/** Three readings — the gate bites, every row is `baseline_forming`, and the
 *  quarter holds one month that was read back at setup rather than gathered. */
export function formingCardFixture(): QuarterlyCard {
  return quarterlyCardFixture({
    readings: 3,
    monthsInQuarter: [
      { month: '2026-07-01', videos: 1290, backRead: true },
      { month: '2026-08-01', videos: 62, backRead: false },
      { month: '2026-09-01', videos: 1448, backRead: false },
    ],
  })
}

/** M3 and M4 unapplied: no window pair, no subject rows, and the card says so
 *  in words rather than printing a zero for a thing nobody counted. */
export function unreadCardFixture(): QuarterlyCard {
  return quarterlyCardFixture({
    thisQuarter: { denominators: null, themes: null },
    lastQuarter: { denominators: null, themes: null },
    subjectsNow: null,
    subjectsBefore: null,
    readings: 3,
  })
}
