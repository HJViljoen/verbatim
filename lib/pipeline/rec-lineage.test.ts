import { describe, it, expect } from 'vitest'
import { assignLineage, normaliseTitle, previousRunId, withoutLineageColumn, REC_LINEAGE_THRESHOLD, type PriorRec, type NewRec, type RunRow } from './rec-lineage'
import { isMissingColumnError } from '../supabase-admin'

// Vectors are precomputed here on purpose: the matcher is pure and no test in
// this repo may call an embedding API. Two-dimensional unit vectors make the
// cosine between any pair readable at a glance.
const unit = (deg: number): number[] => {
  const r = (deg * Math.PI) / 180
  return [Math.cos(r), Math.sin(r)]
}
/** cos 20° ≈ 0.940 — a paraphrase, above the bar. */
const NEAR = 20
/** cos 75° ≈ 0.259 — a different recommendation, well below it. */
const FAR = 75
/** cos 52° ≈ 0.616 — the lowest TRUE pair the calibration keeps. */
const LOWEST_KEPT_TRUE = 52
/** cos 62° ≈ 0.470 — the highest FALSE pair the calibration saw (0.472). */
const HIGHEST_FALSE = 62

const prior = (over: Partial<PriorRec> = {}): PriorRec => ({
  id: 'prior-1',
  lineage_id: 'lin-1',
  type: 'content',
  title: 'Answer the insurance question on camera',
  status: 'new',
  ...over,
})
const next = (over: Partial<NewRec> = {}): NewRec => ({
  id: 'new-1',
  type: 'content',
  title: 'Answer the insurance question on camera',
  ...over,
})

describe('normaliseTitle', () => {
  it('strips case, punctuation and spacing — the noise a reasoning model re-rolls', () => {
    expect(normaliseTitle('Answer the insurance question — on camera!'))
      .toBe(normaliseTitle('answer the  insurance question on camera'))
  })
})

describe('assignLineage', () => {
  it('starts a new lineage at the row’s own id when there is no previous update', () => {
    expect(assignLineage([next()], [])).toEqual([
      { lineageId: 'new-1', status: null, matchedPriorId: null, matchKind: 'new' },
    ])
  })

  it('inherits the lineage on an exact normalised title, with no vectors at all', () => {
    const got = assignLineage([next({ title: 'Answer the INSURANCE question, on camera' })], [prior()])
    expect(got[0]).toEqual({ lineageId: 'lin-1', status: null, matchedPriorId: 'prior-1', matchKind: 'exact' })
  })

  it('falls back to the prior row’s id when the prior carries no lineage yet', () => {
    const got = assignLineage([next()], [prior({ lineage_id: null })])
    expect(got[0].lineageId).toBe('prior-1')
  })

  it('matches a paraphrase above the threshold and not one below it', () => {
    const above = assignLineage(
      [next({ title: 'Put the insurance answer on camera' })],
      [prior()],
      [unit(0)],
      [unit(NEAR)],
    )
    expect(above[0].matchKind).toBe('similar')
    expect(above[0].lineageId).toBe('lin-1')

    const below = assignLineage(
      [next({ title: 'Reply to the top three comments each week' })],
      [prior()],
      [unit(0)],
      [unit(FAR)],
    )
    expect(below[0]).toEqual({ lineageId: 'new-1', status: null, matchedPriorId: null, matchKind: 'new' })
    expect(Math.cos((FAR * Math.PI) / 180)).toBeLessThan(REC_LINEAGE_THRESHOLD)
  })

  it('never matches across types, however identical the title', () => {
    const got = assignLineage([next({ type: 'product' })], [prior({ type: 'content' })], [unit(0)], [unit(0)])
    expect(got[0].matchKind).toBe('new')
    expect(got[0].lineageId).toBe('new-1')
  })

  it('carries a status the client set — dismissed stays dismissed', () => {
    expect(assignLineage([next()], [prior({ status: 'dismissed' })])[0].status).toBe('dismissed')
    expect(assignLineage([next()], [prior({ status: 'acted_on' })])[0].status).toBe('acted_on')
  })

  it('does not carry an untouched status: "new" and null both mean the client never moved it', () => {
    expect(assignLineage([next()], [prior({ status: 'new' })])[0].status).toBeNull()
    expect(assignLineage([next()], [prior({ status: null })])[0].status).toBeNull()
  })

  it('claims each prior once — two near-identical recommendations cannot both inherit one “Done”', () => {
    const got = assignLineage(
      [next({ id: 'new-1', title: 'Put the insurance answer on camera' }), next({ id: 'new-2', title: 'Cover insurance on camera' })],
      [prior({ status: 'acted_on' })],
      // Both clear the bar; new-1 is nearer, so it takes the one prior.
      [unit(NEAR), unit(NEAR + 10)],
      [unit(0)],
    )
    expect(got.filter((g) => g.matchedPriorId === 'prior-1')).toHaveLength(1)
    expect(got.map((g) => g.lineageId).sort()).toEqual(['lin-1', 'new-2'])
  })

  it('prefers the exact title over a closer paraphrase when both are on offer', () => {
    const got = assignLineage(
      [next({ id: 'new-1', title: 'Cover insurance on camera' }), next({ id: 'new-2' })],
      [prior({ status: 'acknowledged' })],
      // new-1 is the nearer vector, but new-2 has the identical title.
      [unit(0), unit(NEAR)],
      [unit(0)],
    )
    expect(got[1]).toMatchObject({ matchedPriorId: 'prior-1', matchKind: 'exact', status: 'acknowledged' })
    expect(got[0].matchKind).toBe('new')
  })

  it('matches on exact titles when the embedding call failed and no vectors arrived', () => {
    const got = assignLineage(
      [next({ id: 'new-1' }), next({ id: 'new-2', title: 'Something else entirely' })],
      [prior({ status: 'in_progress' })],
      [],
      [],
    )
    expect(got[0]).toMatchObject({ lineageId: 'lin-1', status: 'in_progress' })
    expect(got[1].matchKind).toBe('new')
  })
})

describe('surviving a deploy that lands before 20260911140000_initiatives.sql', () => {
  const row = { id: 'r1', client_id: 'c1', run_id: 'run1', type: 'content', title: 'A title', lineage_id: 'r1', status: 'new' }

  it('recognises the one error the retry is for, and nothing else', () => {
    expect(isMissingColumnError({ code: '42703', message: `column "lineage_id" of relation "recommendations" does not exist` }, 'lineage_id')).toBe(true)
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'lineage_id' column of 'recommendations' in the schema cache" }, 'lineage_id')).toBe(true)
    // A real write failure must still kill the run rather than silently retry.
    expect(isMissingColumnError({ code: '23514', message: 'new row violates check constraint "recommendations_status_check"' }, 'lineage_id')).toBe(false)
    expect(isMissingColumnError({ code: '42703', message: `column "status" does not exist` }, 'lineage_id')).toBe(false)
  })

  it('the retry payload drops lineage_id and touches nothing else', () => {
    const [fallback] = withoutLineageColumn([row])
    expect(fallback).not.toHaveProperty('lineage_id')
    expect(fallback).toEqual({ id: 'r1', client_id: 'c1', run_id: 'run1', type: 'content', title: 'A title', status: 'new' })
    // The status the matcher inherited still travels — the client's word is not
    // the bookkeeping column, and it survives the older schema.
    expect(withoutLineageColumn([{ ...row, status: 'acted_on' }])[0].status).toBe('acted_on')
  })

  it('leaves the caller\'s rows alone', () => {
    const rows = [{ ...row }]
    withoutLineageColumn(rows)
    expect(rows[0].lineage_id).toBe('r1')
  })
})

describe('previousRunId — the update the client actually saw', () => {
  const r = (id: string, status: string, started_at: string): RunRow => ({ id, status, started_at })

  it('is the newest completed or partial update, never this one', () => {
    const runs = [r('now', 'completed', '2026-09-06'), r('prev', 'completed', '2026-08-30'), r('older', 'partial', '2026-08-23')]
    expect(previousRunId(runs, 'now')).toBe('prev')
    expect(previousRunId(runs, 'prev')).toBe('now')
  })

  it('skips a run still analysing — it already holds recommendations nobody has seen', () => {
    // Prod on 2026-09-12 held exactly this: one `analyzing` run with 4 recs.
    const runs = [r('inflight', 'analyzing', '2026-09-12'), r('now', 'completed', '2026-09-06'), r('prev', 'completed', '2026-08-30')]
    expect(previousRunId(runs, 'now')).toBe('prev')
  })

  it('skips failed runs', () => {
    expect(previousRunId([r('now', 'completed', '2026-09-06'), r('bad', 'failed', '2026-09-01'), r('prev', 'partial', '2026-08-30')], 'now')).toBe('prev')
  })

  it('orders by the run, not by whatever was written last', () => {
    // A rerunPassDb re-stamps an old run's recommendation rows; ordering on the
    // RUN keeps that from making an old update look like the newest.
    const runs = [r('prev', 'completed', '2026-08-30'), r('ancient', 'completed', '2026-06-01'), r('now', 'completed', '2026-09-06')]
    expect(previousRunId(runs, 'now')).toBe('prev')
  })

  it('is null on a first update, and on a client whose only other runs failed', () => {
    expect(previousRunId([r('now', 'completed', '2026-09-06')], 'now')).toBeNull()
    expect(previousRunId([r('now', 'completed', '2026-09-06'), r('bad', 'failed', '2026-09-01')], 'now')).toBeNull()
    expect(previousRunId([], 'now')).toBeNull()
  })
})

describe('the calibrated bar itself', () => {
  // The one number this WP measured, pinned. Before this, any threshold in
  // (0.26, 0.94) left every test green — the suite exercised nothing near the
  // decision boundary, so the measurement defended itself with nothing.
  it('is 0.55', () => {
    expect(REC_LINEAGE_THRESHOLD).toBe(0.55)
  })

  const pairAt = (deg: number) =>
    assignLineage(
      [next({ id: 'new-1', title: 'A reworded action' })],
      [prior({ status: 'acted_on' })],
      [unit(0)],
      [unit(deg)],
    )[0]

  it('keeps a pair at 0.616 — the lowest true pair in the calibration', () => {
    expect(Math.cos((LOWEST_KEPT_TRUE * Math.PI) / 180)).toBeGreaterThan(REC_LINEAGE_THRESHOLD)
    expect(pairAt(LOWEST_KEPT_TRUE)).toMatchObject({ matchKind: 'similar', lineageId: 'lin-1', status: 'acted_on' })
  })

  it('refuses a pair at 0.470 — the highest false pair in the calibration', () => {
    // "Add a Know Before You Buy standard to every bag page" vs "Turn every
    // product touchpoint into a buy-now page": same surface, different action.
    // Carrying a client's "Done" across that is the failure this bar exists for.
    expect(Math.cos((HIGHEST_FALSE * Math.PI) / 180)).toBeLessThan(REC_LINEAGE_THRESHOLD)
    expect(pairAt(HIGHEST_FALSE)).toMatchObject({ matchKind: 'new', lineageId: 'new-1', status: null })
  })

  it('sits between them — moving the bar past either end breaks a test above', () => {
    expect(REC_LINEAGE_THRESHOLD).toBeGreaterThan(Math.cos((HIGHEST_FALSE * Math.PI) / 180))
    expect(REC_LINEAGE_THRESHOLD).toBeLessThan(Math.cos((LOWEST_KEPT_TRUE * Math.PI) / 180))
  })
})
