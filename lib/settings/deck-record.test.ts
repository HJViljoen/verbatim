import { describe, expect, it } from 'vitest'

import type { ConfigChange } from '../config-log'
import { DECK_CHANGES_ROWS, SEARCH_PLAN_ROWS, deckChangeLogView, searchPlanView } from './deck-record'
import { TERM_YIELD_BASIS, termYieldByMonth } from './terms'

// What the quarterly deck may print about the search plan and the change log
// (block D, D9). Both already exist on Settings and neither has ever reached
// an artefact; what these hold is the two things that must travel with them —
// the search plan's own clock, and the split between a record and inference.

const term = (keyword: string, found: number, kept: number) => ({
  keyword, videos_found: found, gate_survived: kept, created_at: '2026-08-14T09:00:00.000Z',
})

const change = (over: Partial<ConfigChange> = {}): ConfigChange => ({
  id: 'x', client_id: 'c', changed_at: '2026-08-14T09:00:00.000Z', surface: 'terms',
  field: 'brand_keywords', before: ['a'], after: ['a', 'b'],
  actor_kind: 'user', actor_user_id: null, actor_label: null, run_id: null,
  source: 'logged', rows_affected: null, note: 'A search term was added.',
  affects_audiences: null, affects_months: null,
  ...over,
})

describe('searchPlanView', () => {
  const rows = termYieldByMonth([
    term('sealand bag', 400, 180),
    term('dry bag', 120, 0),
    term('roll top', 40, 12),
  ])

  it('keeps the busiest terms and carries the clock they are on', () => {
    const plan = searchPlanView(rows)
    expect(plan.rows.map((r) => r.keyword)).toEqual(['sealand bag', 'dry bag', 'roll top'])
    // THE SENTENCE IS PART OF THE TABLE. This is the one figure in the product
    // honestly dated by the update that searched, and a table of it beside
    // comment-dated months with nothing saying so is the D9 defect.
    expect(plan.basis).toContain('Dated by the update that searched')
    expect(plan.showing).toBeNull()
  })

  it('counts the terms that found something and kept nothing', () => {
    // NOT the terms that found nothing: one is a term pulling in the wrong
    // videos at a cost, the other is a term nobody is using.
    expect(searchPlanView(rows).noYield).toBe(1)
    expect(searchPlanView(termYieldByMonth([term('quiet', 0, 0)])).noYield).toBe(0)
  })

  it('is a real, empty plan when no search ran inside the window', () => {
    // "No search ran in this quarter" is a fact about the quarter; "we hold no
    // search record" is a fact about us, and only the LOADER may say the second
    // (by returning null). A view over zero rows is the first, and it still
    // carries the basis sentence, because an empty table on the wrong clock is
    // still on the wrong clock.
    const plan = searchPlanView([])
    expect(plan.rows).toEqual([])
    expect(plan.showing).toBeNull()
    expect(plan.noYield).toBe(0)
    expect(plan.basis).toBe(TERM_YIELD_BASIS)
  })

  it('names what it hides when there are more terms than rows', () => {
    const many = termYieldByMonth(
      Array.from({ length: SEARCH_PLAN_ROWS + 3 }, (_, i) => term(`t${i}`, 100 - i, 10)),
    )
    const plan = searchPlanView(many)
    expect(plan.rows).toHaveLength(SEARCH_PLAN_ROWS)
    expect(plan.showing).toBe(`Showing the ${SEARCH_PLAN_ROWS} busiest of ${SEARCH_PLAN_ROWS + 3}.`)
  })
})

describe('deckChangeLogView', () => {
  it('lists the logged changes, newest first, with what each one broke', () => {
    const view = deckChangeLogView(
      [
        change({ id: 'a', changed_at: '2026-07-02T10:00:00.000Z' }),
        change({ id: 'b', changed_at: '2026-09-03T10:00:00.000Z', surface: 'rivals', note: 'Poler was added.', affects_audiences: ['competitor:Poler'] }),
      ],
      { affectsRecorded: true },
    )
    expect(view.rows.map((r) => r.id)).toEqual(['b', 'a'])
    expect(view.rows[0].what).toBe('Rivals')
    expect(view.rows[0].breaks).toBe('Poler')
    expect(view.affectsRecorded).toBe(true)
  })

  it('says "not recorded" for the break where M1 is unapplied, rather than "nothing"', () => {
    const view = deckChangeLogView([change()], { affectsRecorded: false })
    expect(view.affectsRecorded).toBe(false)
    expect(view.rows[0].breaks).toBe('Not recorded.')
  })

  it('never lists a reconstructed row beside a recorded one', () => {
    // A reconstructed row is a label worked out afterwards from what each
    // update searched, not a record of an act; `changeLogBoundary` insists the
    // two are never summed, and an artefact listing them together would print
    // the weaker claim as the stronger.
    const view = deckChangeLogView(
      [change({ id: 'a' }), change({ id: 'b', source: 'reconstructed' })],
      { affectsRecorded: true },
    )
    expect(view.rows.map((r) => r.id)).toEqual(['a'])
  })

  it('caps the list and names what it hides', () => {
    const rows = Array.from({ length: DECK_CHANGES_ROWS + 2 }, (_, i) =>
      change({ id: `c${i}`, changed_at: `2026-08-${String(i + 1).padStart(2, '0')}T09:00:00.000Z` }))
    const view = deckChangeLogView(rows, { affectsRecorded: true })
    expect(view.rows).toHaveLength(DECK_CHANGES_ROWS)
    expect(view.showing).toBe(`Showing the ${DECK_CHANGES_ROWS} most recent of ${DECK_CHANGES_ROWS + 2}.`)
  })
})
