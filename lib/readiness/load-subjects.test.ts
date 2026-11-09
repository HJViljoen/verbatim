import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../config'
import { TABLE_DENOMINATORS } from '../reading/types'
import { fakeDb } from '../test/fake-db'
import { computeReadiness } from './compute'
import { loadReadiness } from './load'

// The readiness check's subject row (9 Nov, the live-data bugs):
// `/dashboard/ops/readiness` said "There is no subject set yet." about Össur,
// which has six. The loader still carried its pre-Phase-1 placeholder
// (`subjectSet: { defined: null }`, "the concept does not exist yet") and
// never read the subjects table. It now counts the workspace's confirmed
// subjects, the set every update measures (`status = 'active'`).

const CLIENT = OSSUR_CLIENT_ID
const NOW = new Date('2026-11-09T09:00:00.000Z')

function tables(subjects: Record<string, unknown>[] | null) {
  const t: Record<string, Record<string, unknown>[]> = {
    clients: [{ id: CLIENT, company_name: 'Össur' }],
    tracking_configs: [{ client_id: CLIENT, brand_keywords: ['ossur'], competitor_keywords: [], industry_keywords: [], exclude_terms: [], updated_at: null, report_period: 'weekly' }],
    videos: [], comments: [], gate_verdicts: [], recommendations: [], pipeline_runs: [], report_schedules: [],
    audience_insights: [], audience_insights_current: [], insight_evidence: [], themes: [],
    anomaly_checks: [], anomaly_flags: [], config_changes: [], gate_appeals: [], rec_decisions: [],
    [TABLE_DENOMINATORS]: [],
  }
  if (subjects) t.subjects = subjects
  return t
}

const subject = (id: string, status: string, client = CLIENT) => ({ id, client_id: client, name: id, status })

describe('the readiness check reads the subject set', () => {
  it('counts the workspace\'s confirmed subjects', async () => {
    const db = fakeDb(tables([
      ...['fit', 'cost', 'function', 'look', 'community', 'choosing'].map((id) => subject(id, 'active')),
      subject('proposed-one', 'proposed'),
      subject('retired-one', 'retired'),
      subject('elsewhere', 'active', 'another-tenant'),
    ]))
    const inputs = await loadReadiness(db.client as never, CLIENT, NOW)
    expect(inputs.subjectSet.defined).toBe(6)
    const row = computeReadiness(inputs).find((r) => r.id === 'subject-set')!
    expect(row.status).toBe('exists')
    expect(row.detail).toBe('6 subjects named.')
    expect(row.unlocks).not.toMatch(/Phase 1/)
  })

  it('says none is named where the table is there and empty', async () => {
    const inputs = await loadReadiness(fakeDb(tables([])).client as never, CLIENT, NOW)
    expect(inputs.subjectSet.defined).toBe(0)
    expect(computeReadiness(inputs).find((r) => r.id === 'subject-set')!.detail).toBe('No subject has been named for this workspace yet.')
  })

  it('says there is no subject set only where the subjects table is missing', async () => {
    const inputs = await loadReadiness(fakeDb(tables(null)).client as never, CLIENT, NOW)
    expect(inputs.subjectSet.defined).toBeNull()
  })
})
