import { describe, it, expect } from 'vitest'
import { assignLineage, normaliseTitle, REC_LINEAGE_THRESHOLD, type PriorRec, type NewRec } from './rec-lineage'

// Vectors are precomputed here on purpose: the matcher is pure and no test in
// this repo may call an embedding API. Two-dimensional unit vectors make the
// cosine between any pair readable at a glance.
const unit = (deg: number): number[] => {
  const r = (deg * Math.PI) / 180
  return [Math.cos(r), Math.sin(r)]
}
/** cos 20° ≈ 0.940 — a paraphrase, above the bar. */
const NEAR = 20
/** cos 60° = 0.5 — a different recommendation, well below it. */
const FAR = 60

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
