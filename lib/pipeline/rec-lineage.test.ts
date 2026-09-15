import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  assignLineage, normaliseTitle, normaliseRecType, lineageThresholdFor, previousRunId,
  withoutLineageColumn, inheritedStatus, isMissingRecDecisions,
  REC_LINEAGE_THRESHOLD, REC_LINEAGE_CROSS_TYPE_THRESHOLD, REC_DECISIONS_TABLE,
  type PriorRec, type NewRec, type RunRow, type RecDecision,
} from './rec-lineage'
import { isMissingColumnError } from '../supabase-admin'
import { RECOMMENDATION_TYPES } from './schemas'
import { REC_STATUSES } from '../calibration'

// Vectors are precomputed here on purpose: the matcher is pure and no test in
// this repo may call an embedding API. Two-dimensional unit vectors make the
// cosine between any pair readable at a glance.
const unit = (deg: number): number[] => {
  const r = (deg * Math.PI) / 180
  return [Math.cos(r), Math.sin(r)]
}
/** cos 20° ≈ 0.940 — a paraphrase, above both bars. */
const NEAR = 20
/** cos 75° ≈ 0.259 — a different recommendation, well below either. */
const FAR = 75
/** cos 52° ≈ 0.616 — the lowest TRUE pair the calibration keeps. Same-type
 *  only: it does not reach the cross-type bar, which is the point of that bar. */
const LOWEST_KEPT_TRUE = 52
/** cos 48° ≈ 0.669 — clears the cross-type bar too. */
const CROSS_TYPE_CLEAR = 48
/** cos 62° ≈ 0.470 — the highest FALSE pair the calibration saw (0.472). */
const HIGHEST_FALSE = 62

const prior = (over: Partial<PriorRec> = {}): PriorRec => ({
  id: 'prior-1',
  lineage_id: 'lin-1',
  type: 'content_communication',
  title: 'Answer the insurance question on camera',
  status: 'new',
  ...over,
})
const next = (over: Partial<NewRec> = {}): NewRec => ({
  id: 'new-1',
  type: 'content_communication',
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

  it('scores a cross-type pair against the higher bar instead of refusing it (D11)', () => {
    // The gate this replaces: 41 of 107 new recommendations in production had
    // no same-type prior to score at all, and the two nearest misses in the data
    // are a category renamed by a later prompt version.
    const cross = (deg: number) =>
      assignLineage(
        [next({ type: 'audience_targeting', title: 'A reworded action' })],
        [prior({ type: 'product', status: 'acted_on' })],
        [unit(0)],
        [unit(deg)],
      )[0]

    expect(cross(CROSS_TYPE_CLEAR)).toMatchObject({ matchKind: 'similar', lineageId: 'lin-1', status: 'acted_on' })
    // 0.616 is a match when the types agree and not when they do not: the extra
    // distance is what a different label costs.
    expect(cross(LOWEST_KEPT_TRUE).matchKind).toBe('new')
  })

  it('folds a model-invented type to `other`, so two one-off labels score as a pair', () => {
    // `creator_clinic_distribution` and `maker_program` each appear in exactly
    // one production update. Neither is in the enum; both are `other` here, so
    // the pair gets the SAME-type bar rather than the cross-type one.
    const got = assignLineage(
      [next({ type: 'creator_clinic_distribution', title: 'A reworded action' })],
      [prior({ type: 'maker_program', status: 'acknowledged' })],
      [unit(0)],
      [unit(LOWEST_KEPT_TRUE)],
    )[0]
    expect(got).toMatchObject({ matchKind: 'similar', lineageId: 'lin-1', status: 'acknowledged' })
  })

  it('lets an exact title cross types — a re-tag changed the filing, not the action', () => {
    const got = assignLineage([next({ type: 'product' })], [prior({ type: 'customer_experience' })], [], [])
    expect(got[0]).toMatchObject({ matchKind: 'exact', lineageId: 'lin-1' })
  })

  it('gives a same-type prior the tie at an identical score', () => {
    const got = assignLineage(
      [next({ id: 'new-1', title: 'A reworded action' })],
      [
        prior({ id: 'cross', lineage_id: 'lin-cross', type: 'product' }),
        prior({ id: 'same', lineage_id: 'lin-same' }),
      ],
      [unit(0)],
      [unit(CROSS_TYPE_CLEAR), unit(CROSS_TYPE_CLEAR)],
    )
    expect(got[0].lineageId).toBe('lin-same')
    expect(got[0].matchedPriorId).toBe('same')
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

describe('normaliseRecType — the label, as much of it as is worth comparing', () => {
  it('keeps every name the schema does', () => {
    for (const t of RECOMMENDATION_TYPES) expect(normaliseRecType(t)).toBe(t)
  })

  it('folds everything else to `other` — 44% of production rows', () => {
    // Every one of these is a real stored value on Össur or Sealand.
    for (const t of [
      'content_idea', 'hook_strategy', 'platform_strategy', 'competitive_move',
      'pricing_access', 'urgent_topic', 'audience_target', 'assortment_architecture',
      'maker_program', 'creator_clinic_distribution', 'adjacent_category_test',
      'community_programming', 'style_customization', 'distribution_access',
      'partnerships_distribution', 'distribution_partnerships',
    ]) expect(normaliseRecType(t), t).toBe('other')
  })

  it('does not read a missing or blank type as a type', () => {
    expect(normaliseRecType(null)).toBe('other')
    expect(normaliseRecType('  ')).toBe('other')
    expect(normaliseRecType('Customer_Experience')).toBe('customer_experience')
  })

  it('is what picks the bar', () => {
    expect(lineageThresholdFor('product', 'product')).toBe(REC_LINEAGE_THRESHOLD)
    // Two different invented labels are both `other`, so they share a bar.
    expect(lineageThresholdFor('maker_program', 'urgent_topic')).toBe(REC_LINEAGE_THRESHOLD)
    // A near-miss the old equality gate refused outright.
    expect(lineageThresholdFor('audience_target', 'audience_targeting')).toBe(REC_LINEAGE_CROSS_TYPE_THRESHOLD)
    expect(lineageThresholdFor('product', 'customer_experience')).toBe(REC_LINEAGE_CROSS_TYPE_THRESHOLD)
  })
})

describe('inheritedStatus — what the ledger says this lineage is', () => {
  const d = (over: Partial<RecDecision> = {}): RecDecision => ({
    lineage_id: 'lin-1',
    status: 'acted_on',
    decided_at: '2026-09-15T08:00:00.000Z',
    ...over,
  })

  it('is null when nothing has ever been decided', () => {
    expect(inheritedStatus('lin-1', [])).toBeNull()
    expect(inheritedStatus('lin-1', [d({ lineage_id: 'lin-2' })])).toBeNull()
  })

  it('is the latest decision, whatever order the rows arrive in', () => {
    const rows = [
      d({ status: 'acknowledged', decided_at: '2026-09-15T08:00:00.000Z' }),
      d({ status: 'dismissed', decided_at: '2026-09-20T08:00:00.000Z' }),
      d({ status: 'in_progress', decided_at: '2026-09-17T08:00:00.000Z' }),
    ]
    expect(inheritedStatus('lin-1', rows)).toBe('dismissed')
    expect(inheritedStatus('lin-1', [...rows].reverse())).toBe('dismissed')
  })

  it('answers a reset to New with null, instead of the "Done" that preceded it', () => {
    // The menu offers New like any other word. Carrying the older acted_on over
    // it would undo the client's own correction on their next update, silently.
    expect(inheritedStatus('lin-1', [
      d({ status: 'acted_on', decided_at: '2026-09-15T08:00:00.000Z' }),
      d({ status: 'new', decided_at: '2026-09-16T08:00:00.000Z' }),
    ])).toBeNull()
    // …and the other way round, a Done after a reset is still a Done.
    expect(inheritedStatus('lin-1', [
      d({ status: 'new', decided_at: '2026-09-15T08:00:00.000Z' }),
      d({ status: 'acted_on', decided_at: '2026-09-16T08:00:00.000Z' }),
    ])).toBe('acted_on')
  })

  it('reads only its own lineage', () => {
    const rows = [
      d({ lineage_id: 'lin-2', status: 'dismissed', decided_at: '2026-09-20T08:00:00.000Z' }),
      d({ status: 'in_progress', decided_at: '2026-09-16T08:00:00.000Z' }),
    ]
    expect(inheritedStatus('lin-1', rows)).toBe('in_progress')
    expect(inheritedStatus('lin-2', rows)).toBe('dismissed')
  })

  it('breaks a same-instant tie on the row that arrives last', () => {
    const at = '2026-09-15T08:00:00.000Z'
    expect(inheritedStatus('lin-1', [d({ status: 'acted_on', decided_at: at }), d({ status: 'dismissed', decided_at: at })]))
      .toBe('dismissed')
  })
})

describe('surviving a deploy that lands before 20260915093000_rec_decisions.sql', () => {
  it('recognises the ledger missing, by any of the four ways it is said', () => {
    expect(isMissingRecDecisions({ code: 'PGRST205', message: `Could not find the table 'public.${REC_DECISIONS_TABLE}' in the schema cache` })).toBe(true)
    expect(isMissingRecDecisions({ code: '42P01', message: `relation "public.${REC_DECISIONS_TABLE}" does not exist` })).toBe(true)
    expect(isMissingRecDecisions({ code: 'PGRST204', message: `Could not find the 'note' column of '${REC_DECISIONS_TABLE}' in the schema cache` })).toBe(true)
    expect(isMissingRecDecisions(new Error(`relation "public.${REC_DECISIONS_TABLE}" does not exist`))).toBe(true)
  })

  it('is not a blanket swallow — another table, or a real write failure, is neither', () => {
    expect(isMissingRecDecisions({ code: '42P01', message: 'relation "public.recommendations" does not exist' })).toBe(false)
    expect(isMissingRecDecisions({ code: '23514', message: `new row for relation "${REC_DECISIONS_TABLE}" violates check constraint` })).toBe(false)
    expect(isMissingRecDecisions({ code: '42501', message: `permission denied for table ${REC_DECISIONS_TABLE}` })).toBe(false)
    expect(isMissingRecDecisions(null)).toBe(false)
  })
})

describe('the mirror in the migration — the two have to keep saying the same thing', () => {
  // The ledger carries its own copy of the status vocabulary, in SQL, and its
  // own list of what a browser may write. A change to one side only is silent
  // until a client presses the control: a word the UI offers and the CHECK
  // refuses fails in front of them, and a column the action writes without a
  // grant 403s the whole decision.
  const sql = readFileSync(new URL('../../supabase/migrations/20260915093000_rec_decisions.sql', import.meta.url), 'utf8')

  it('checks exactly the words lib/calibration.ts REC_STATUSES names', () => {
    const check = sql.match(/status\s+text not null check \(status in \(([^)]*)\)\)/)?.[1]
    expect(check, 'the status CHECK is no longer where this test looks for it').toBeTruthy()
    expect([...check!.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...REC_STATUSES])
  })

  it('grants insert on exactly the columns the server action writes', () => {
    const grant = sql.match(/grant insert \(([^)]*)\)\s*\n?\s*on public\.rec_decisions to authenticated/)?.[1]
    expect(grant, 'the insert grant is no longer where this test looks for it').toBeTruthy()
    const columns = grant!.split(',').map((c) => c.trim()).sort()
    expect(columns).toEqual(
      ['client_id', 'lineage_id', 'recommendation_id', 'run_id', 'status', 'decided_by', 'note'].sort(),
    )
    // `id` and `decided_at` are deliberately outside it: a decision cannot be
    // backdated, and one cannot be overwritten by reusing its id.
    expect(columns).not.toContain('id')
    expect(columns).not.toContain('decided_at')
  })

  it('leaves the ledger append-only — no update or delete anywhere in it', () => {
    expect(sql).not.toMatch(/for update on public\.rec_decisions|grant update[^;]*rec_decisions/i)
    expect(sql).not.toMatch(/grant delete[^;]*rec_decisions/i)
  })

  it('backfills the lineage so NULL stops meaning two different things', () => {
    expect(sql).toMatch(/update public\.recommendations set lineage_id = id where lineage_id is null;/)
  })
})

describe('the calibrated bar itself', () => {
  // The one number this WP measured, pinned. Before this, any threshold in
  // (0.26, 0.94) left every test green — the suite exercised nothing near the
  // decision boundary, so the measurement defended itself with nothing.
  it('is 0.55, and 0.62 when the labels disagree', () => {
    expect(REC_LINEAGE_THRESHOLD).toBe(0.55)
    expect(REC_LINEAGE_CROSS_TYPE_THRESHOLD).toBe(0.62)
    // The cross-type bar is a guess ABOVE the measurement, not inside it: it
    // clears the lowest true pair the labelling kept (0.605).
    expect(REC_LINEAGE_CROSS_TYPE_THRESHOLD).toBeGreaterThan(REC_LINEAGE_THRESHOLD)
    expect(REC_LINEAGE_CROSS_TYPE_THRESHOLD).toBeGreaterThan(0.605)
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
