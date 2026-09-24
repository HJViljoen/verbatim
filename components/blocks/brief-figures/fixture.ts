import { cannotTell, crosscheckLine, monthLine, scriptedLines, switchingFigure, type SwitchingVideo } from '@/lib/reports/documents/figures'
import type { BriefSlideFigures } from '@/lib/reports/documents/load-reading'
import { SALES_MAP, untrackedNotes, type ReadinessLike } from '@/lib/reports/documents/sections'
import { monthlyLineLabel } from '@/lib/pages/overview'
import { CLIENT_AUDIENCE } from '@/lib/rivals'
import type { FigureTable as ReadingFigures, RefusedReason, Verdict, VerdictState, VerdictWindow } from '@/lib/reading/verdicts'

// The sales brief's slide figures (Block D wave 1, package D7).
//
// WHY A FIXTURE AND NOT JUST A TYPE. Five of these six figures existed only as
// types and as inputs inside unit tests, so the wave-2 sales-brief port had a
// shape and no data: no render test (the render tier needs a fixture), no
// sight of the three states that matter, and a hand-typed one of its own —
// which is the drift `reports-card/fixture.ts` argues against in its own
// header.
//
// THEY GO THROUGH THE REAL BUILDERS, same rule. Nothing here is hand-typed
// except the counts a loader would have read.
//
// THREE STATES, AND TWO OF THEM ARE PRODUCTION TODAY:
//   `briefFiguresFixture()` — the pool clears the floor, an objection carries
//                             a crosscheck, the line draws, refusals present.
//   `thinFiguresFixture()`  — PRODUCTION TODAY: 35 videos named both, so the
//                             figure refuses and says how many it had; two
//                             months of readings, so the line names them
//                             instead of drawing.
//   `unreadFiguresFixture()`— `month_kind_readings` unapplied (also production
//                             today): no objection, so no Say-this row and no
//                             crosscheck, and nothing named both, so no
//                             switching figure at all.

const WINDOW: VerdictWindow = { kind: 'month', from: '2026-09-01', to: '2026-10-01' }
const MONTHS = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']

/** The one figure in the package that is not comment-dated, and it says so. */
const BASIS = 'dated by when each video was posted, not by when the conversation under it happened'

const pool = (toward: number, away: number, neither: number): SwitchingVideo[] => {
  const out: SwitchingVideo[] = []
  let n = 0
  for (let i = 0; i < toward; i += 1) out.push({ id: `v${n++}`, sentiment: 'positive' })
  for (let i = 0; i < away; i += 1) out.push({ id: `v${n++}`, sentiment: 'negative' })
  for (let i = 0; i < neither; i += 1) out.push({ id: `v${n++}`, sentiment: null })
  return out
}

const switching = (videos: SwitchingVideo[]) =>
  switchingFigure({ window: WINDOW, audience: CLIENT_AUDIENCE, audienceLabel: 'your own videos', videos, basis: BASIS })

const verdict = (state: VerdictState, reason?: RefusedReason): Verdict => ({
  objectKind: 'theme',
  objectId: 't1',
  objectLabel: 'Will it survive a wet commute',
  audience: 'industry-other',
  window: WINDOW,
  value: { k: 130, n: 1388 },
  changePts: null,
  bandPts: null,
  state,
  flags: [],
  ...(reason ? { refusedReason: reason } : {}),
})

const FIGURES: ReadingFigures = {
  objection_share: { value: 13.7, unit: 'pct', label: 'the objection’s share of the month' },
}

/** The readiness rows the sales map's one NOTE hangs off. `partial` counts for
 *  a note and does not count for a refusal, which is the whole reason
 *  `untrackedNotes` is not `missingInputs`. */
const READINESS: ReadinessLike[] = [
  {
    id: 'rival-accounts',
    input: 'the rival accounts we read for this workspace',
    status: 'partial',
    owner: 'Verbatim',
    ownerRole: 'ops',
    unlocks: 'what each rival says on their own posts',
  },
]

const OBJECTION = { label: 'Pushing back', value: { k: 28, n: 205 } }

/** A month that reads on every side: the pool bands, the objection squares
 *  against it, three readings stand behind the line, and two comparisons were
 *  refused and say why. */
export function briefFiguresFixture(): BriefSlideFigures {
  const figure = switching(pool(64, 22, 34))
  return {
    cannotTell: cannotTell([verdict('moved'), verdict('refused', 'clustering_changed'), verdict('baseline_forming')]),
    switching: figure,
    crosscheck: figure ? crosscheckLine(figure, OBJECTION) : null,
    scripted: scriptedLines({
      figures: FIGURES,
      lines: [
        {
          objection: { label: OBJECTION.label, registryId: null, source: 'kind', value: OBJECTION.value },
          // No reason for the objection was measured, so none is claimed; the
          // counted context of the same month is printed as what it is.
          because: [],
          alsoRunning: [
            { label: 'Durability', value: { k: 46, n: 205 } },
            { label: 'Price and value', value: { k: 31, n: 205 } },
          ],
          // No draft: a loader that invented a sentence is the one thing
          // `scrubProse` exists to stop. A build hands its writer's draft in.
          draft: null,
        },
      ],
    }),
    line: monthLine({
      months: MONTHS,
      labelFor: monthlyLineLabel,
      series: [{ label: 'Durability · the prosthetics conversation', points: [18, 19, 19.5, 20], unit: 'pct' }],
    }),
    untracked: untrackedNotes(SALES_MAP, READINESS),
  }
}

/**
 * PRODUCTION TODAY on the larger tenant: 35 own videos named a tracked rival
 * inside the month, where a banded reading needs 100. The figure prints the
 * count and refuses, and the line has two readings, so the months are named
 * rather than drawn.
 */
export function thinFiguresFixture(): BriefSlideFigures {
  const figure = switching(pool(27, 0, 8))
  return {
    ...briefFiguresFixture(),
    switching: figure,
    crosscheck: figure ? crosscheckLine(figure, OBJECTION) : null,
    line: monthLine({
      months: MONTHS,
      labelFor: monthlyLineLabel,
      series: [{ label: 'Durability · the prosthetics conversation', points: [null, null, 19, 19.2], unit: 'pct' }],
    }),
  }
}

/**
 * ALSO PRODUCTION TODAY: `month_kind_readings` is not applied on either live
 * workspace, so there is no objection to script or to square anything against,
 * and nothing in the month named both a rival and the tenant. Every one of
 * those is an absence said in words, never a zero.
 */
export function unreadFiguresFixture(): BriefSlideFigures {
  return {
    ...briefFiguresFixture(),
    switching: null,
    crosscheck: null,
    scripted: [],
    line: monthLine({ months: MONTHS, labelFor: monthlyLineLabel, series: [] }),
  }
}
