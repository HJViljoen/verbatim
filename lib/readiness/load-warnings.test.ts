import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID } from '../config'
import { runWarning, warningSentence } from '../pipeline/run-warnings'
import { TABLE_DENOMINATORS } from '../reading/types'
import { fakeDb } from '../test/fake-db'
import { computeReadiness } from './compute'
import { loadReadiness, loadRunWarnings } from './load'

// The ops readiness page's Updates row lists each recent update one line a
// run; since 9 Nov a run's warnings (steps out of retries the run does not
// count, `pipeline_runs.warnings`) follow its line, on the operator's page
// alone. The client's Settings › Readiness and the documents never ask, so
// their rows are what they were.

const CLIENT = OSSUR_CLIENT_ID
const NOW = new Date('2026-11-09T09:00:00.000Z')
const LENS = runWarning('lens-readings', Object.assign(new Error('duplicate key value violates unique constraint "month_lens_readings_pkey"'), { code: '23505' }), { month: '2026-10-01' })
const EMBED = runWarning('embed-insights', new Error('timeout'))

function tables(runs: Record<string, unknown>[]) {
  return {
    clients: [{ id: CLIENT, company_name: 'Össur' }],
    tracking_configs: [{ client_id: CLIENT, brand_keywords: ['ossur'], competitor_keywords: [], industry_keywords: [], exclude_terms: [], updated_at: null, report_period: 'weekly' }],
    videos: [], comments: [], gate_verdicts: [], recommendations: [], pipeline_runs: runs, report_schedules: [],
    audience_insights: [], audience_insights_current: [], insight_evidence: [], themes: [], subjects: [],
    anomaly_checks: [], anomaly_flags: [], config_changes: [], gate_appeals: [], rec_decisions: [],
    [TABLE_DENOMINATORS]: [],
  }
}

const RUNS = [
  { id: 'run-8nov', client_id: CLIENT, status: 'completed', started_at: '2026-11-08T04:03:00Z', completed_at: '2026-11-08T07:30:00Z', warnings: [LENS, EMBED] },
  { id: 'run-1nov', client_id: CLIENT, status: 'partial', started_at: '2026-11-01T04:03:00Z', completed_at: '2026-11-01T07:30:00Z', warnings: [] },
]

describe('the ops page shows each run’s warnings under its line', () => {
  it('asked for, each warning follows its run’s line as a plain sentence; the line and the row’s status do not move', async () => {
    const inputs = await loadReadiness(fakeDb(tables(RUNS)).client as never, CLIENT, NOW, { warnings: true })
    expect(inputs.warningsRecorded).toBe(true)
    expect(inputs.updates[0].warnings).toEqual([LENS, EMBED])
    expect(inputs.updates[1].warnings).toBeUndefined()
    const row = computeReadiness(inputs).find((r) => r.id === 'update-record')!
    expect(row.notes.slice(0, 4)).toEqual([
      '8 Nov 2026: finished · by hand',
      warningSentence(LENS),
      warningSentence(EMBED),
      '1 Nov 2026: finished, with gaps · by hand',
    ])
    expect(row.notes[1]).toMatch(/^Stale data: lens readings for October 2026 did not finish \(Postgres 23505: /)
    expect(row.notes[2]).toMatch(/^Housekeeping: /)
    const plain = computeReadiness(await loadReadiness(fakeDb(tables(RUNS)).client as never, CLIENT, NOW)).find((r) => r.id === 'update-record')!
    expect(row.status).toBe(plain.status)
    expect(row.detail).toBe(plain.detail)
  })

  it('not asked for (Settings, documents): no warning is read and the row is exactly what it was', async () => {
    const db = fakeDb(tables(RUNS))
    const inputs = await loadReadiness(db.client as never, CLIENT, NOW)
    expect('warningsRecorded' in inputs).toBe(false)
    expect(inputs.updates.every((u) => u.warnings === undefined)).toBe(true)
    expect(db.calls.some((c) => c.table === 'pipeline_runs' && /\bwarnings\b/.test(c.columns ?? ''))).toBe(false)
    const row = computeReadiness(inputs).find((r) => r.id === 'update-record')!
    expect(row.notes.slice(0, 2)).toEqual(['8 Nov 2026: finished · by hand', '1 Nov 2026: finished, with gaps · by hand'])
    expect(row.notes.join('\n')).not.toMatch(/Stale data|Housekeeping|Warnings are not recorded/)
  })
})

// The column probe on the page's side: before 20261114090000_run_warnings.sql
// the read answers 42703 (or PGRST204 from a stale schema cache) and the page
// says warnings are not recorded yet, never "none".
describe('loadRunWarnings: the column probe', () => {
  const admin = (result: { data: unknown; error: unknown }) => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => Promise.resolve(result) }
    return { from: () => chain } as never
  }

  it('reads the newest runs’ warnings by run id, leaving out runs with none', async () => {
    const got = await loadRunWarnings(admin({ data: [{ id: 'a', warnings: [LENS] }, { id: 'b', warnings: [] }, { id: 'c', warnings: null }], error: null }), CLIENT, 8)
    expect([...(got ?? new Map()).entries()]).toEqual([['a', [LENS]]])
  })

  it('is null where the column is not there yet, and the row says so once', async () => {
    for (const error of [
      { code: '42703', message: 'column pipeline_runs.warnings does not exist' },
      { code: 'PGRST204', message: "Could not find the 'warnings' column of 'pipeline_runs' in the schema cache" },
    ]) {
      expect(await loadRunWarnings(admin({ data: null, error }), CLIENT, 8)).toBeNull()
    }
    const inputs = await loadReadiness(fakeDb(tables(RUNS)).client as never, CLIENT, NOW)
    const row = computeReadiness({ ...inputs, warningsRecorded: false }).find((r) => r.id === 'update-record')!
    expect(row.notes.filter((n) => n.startsWith('Warnings are not recorded on updates yet'))).toHaveLength(1)
  })

  it('throws on any other error: “no warning” and “we could not look” are different answers', async () => {
    await expect(loadRunWarnings(admin({ data: null, error: { code: '57014', message: 'statement timeout' } }), CLIENT, 8)).rejects.toMatchObject({ code: '57014' })
  })
})

// The column has one reader, this loader: no rule that judges a run (the
// status, the gathers, the chart weeks, thin weeks, the weekly email, the
// briefs, the ops check) can read a warning.
describe('the warnings column', () => {
  const ROOT = join(__dirname, '..', '..')
  it('nothing reads the warnings column but the ops page’s loader', () => {
    const readers: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && /\.select\([^)]*\bwarnings\b/.test(readFileSync(p, 'utf8'))) readers.push(p.slice(ROOT.length + 1))
      }
    }
    for (const dir of ['app', 'lib', 'inngest', 'components', 'scripts']) walk(join(ROOT, dir))
    expect(readers).toEqual(['lib/readiness/load.ts'])
  })
})
