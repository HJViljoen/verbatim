import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { fakeAdmin } from '../test/s3-run-fake-admin'
import { applyQueuedEdits, dueEdits, landsOn, type QueuedEdit } from './tracking-queue'

// Queued tracking edits applied by open-run (decision I; WP3.10). The terms
// are Sealand's own: `upcycled bag` (84% makers), the one the plan says to
// revisit with Daniela, and the 13 Sep additions; ids and labels are labels.

const q = (over: Partial<QueuedEdit> & Pick<QueuedEdit, 'id' | 'field' | 'effective_month' | 'queued_at'>): QueuedEdit => ({
  after: [], queued_by: null, queued_label: 'Daniela (owner)', applied_at: null, ...over,
})
const DROP_UPCYCLED = q({ id: 'e1', field: 'industry_keywords', after: ['handmade bag', 'sustainable fashion', 'travel gear'], effective_month: '2026-11-01', queued_at: '2026-10-14T09:00:00Z' })
const CHANGE_OF_MIND = q({ id: 'e2', field: 'industry_keywords', after: ['handmade bag', 'travel gear'], effective_month: '2027-01-01', queued_at: '2026-10-20T09:00:00Z' })
const LATER = q({ id: 'e3', field: 'competitor_names', after: ['Cotopaxi', 'Patagonia'], effective_month: '2027-02-01', queued_at: '2026-10-21T09:00:00Z' })

describe('when a queued edit lands', () => {
  it('on its month\'s 1st, never before 1 January 2027', () => {
    expect(landsOn(DROP_UPCYCLED)).toBe('2027-01-01')
    expect(landsOn(LATER)).toBe('2027-02-01')
  })

  it('nothing is due before 2027, whatever month an edit names', () => {
    expect(dueEdits([DROP_UPCYCLED, CHANGE_OF_MIND, LATER], '2026-12-06T07:00:00Z').apply).toEqual([])
    expect(dueEdits([DROP_UPCYCLED], '2026-12-31T23:59:59Z').apply).toEqual([])
  })

  it('the first update of January applies the newest edit of each due field; the older is superseded; February waits', () => {
    const d = dueEdits([DROP_UPCYCLED, CHANGE_OF_MIND, LATER], '2027-01-03T07:00:00Z')
    expect(d.apply.map((e) => e.id)).toEqual(['e2'])
    expect(d.superseded.map((e) => e.id)).toEqual(['e1'])
  })
})

describe('the apply', () => {
  const admin = () => fakeAdmin({
    tables: {
      tracking_config_queue: [DROP_UPCYCLED, CHANGE_OF_MIND, LATER].map((e) => ({ client_id: SEALAND_CLIENT_ID, ...e })),
      tracking_configs: [{ client_id: SEALAND_CLIENT_ID, industry_keywords: ['upcycled bag', 'handmade bag', 'sustainable fashion', 'travel gear'], competitor_names: ['Cotopaxi'] }],
    },
  })

  it('is inert before 2027: nothing written', async () => {
    const f = admin()
    const r = await applyQueuedEdits(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2026-11-08', now: '2026-11-08T04:00:00Z' })
    expect(r).toMatchObject({ status: 'nothing_due', note: '3 queued, the first lands on 2027-01-01' })
    expect(f.writes).toEqual([])
  })

  it('applies with an actor naming the run and who asked, stamps applied_at once, and a second run applies nothing', async () => {
    const f = admin()
    const r = await applyQueuedEdits(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2027-01-03', now: '2027-01-03T04:00:00Z' })
    expect(r.status).toBe('applied')
    const cfg = f.tables.tracking_configs[0]
    expect(cfg.industry_keywords).toEqual(['handmade bag', 'travel gear'])
    expect(cfg.competitor_names).toEqual(['Cotopaxi'])
    expect(cfg.last_actor).toMatchObject({ kind: 'pipeline', run_id: 'run-2027-01-03', label: 'queued tracking edit · asked by Daniela (owner) on 2026-10-20' })
    expect(f.tables.tracking_config_queue.filter((e) => e.applied_at).map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    const again = await applyQueuedEdits(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'run-2027-01-10', now: '2027-01-10T04:00:00Z' })
    expect(again.status).toBe('nothing_due')
  })

  it('is a no-op before MF3', async () => {
    const f = fakeAdmin({ tables: { tracking_configs: [] } })
    expect((await applyQueuedEdits(f.client, { clientId: SEALAND_CLIENT_ID, runId: 'r', now: '2027-01-03T04:00:00Z' })).status).toBe('not_applied')
  })
})
