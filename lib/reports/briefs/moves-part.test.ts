import { describe, expect, it, vi } from 'vitest'

import { fakeDb } from '../../test/fake-db'
import { loadMovesPart } from './app-load'

// WHAT EACH PIECE OF ADVICE WOULD MOVE, READ ON THE BRIEF'S OWN RUN (5 Nov).
// The month's briefs are built inside the run that closes the month, after
// its freeze-months has rewritten the filling months under its own themes and
// while it still counts as running. A page's rule (the newest themed run that
// is not running) then names the update before, whose conversations the
// month's readings no longer hold: Sealand's October leadership brief printed
// two pieces of advice at "0 of 1,192 videos" while Your moves read them at
// their real levels. The brief now reads its targets on its own run.

const CLIENT = '00000000-0000-4000-8000-0000000000aa'
const BEFORE = '00000000-0000-4000-8000-0000000000b0'
const CLOSING = '00000000-0000-4000-8000-0000000000bb'
const L1 = '00000000-0000-4000-8000-0000000000a1'
const OLD_THEME = '00000000-0000-4000-8000-0000000000e0'
const NEW_THEME = '00000000-0000-4000-8000-0000000000e1'

const run = (id: string, status: string, day: string) => ({
  id, client_id: CLIENT, status, started_at: `${day}T04:00:00.000Z`, completed_at: status === 'running' ? null : `${day}T06:00:00.000Z`,
  errors: [], window_start: '2026-10-25T00:00:00.000Z', window_end: `${day}T00:00:00.000Z`, options: {},
})

function tables() {
  return {
    clients: [{ id: CLIENT, company_name: 'Sealand' }],
    pipeline_runs: [run(BEFORE, 'completed', '2026-10-28'), run(CLOSING, 'running', '2026-11-05')],
    recommendations: [{
      id: '00000000-0000-4000-8000-0000000000c1', lineage_id: L1, client_id: CLIENT, title: 'Package it for comparison shopping', type: 'product', status: 'new',
      priority: 'high', created_at: '2026-10-28T06:00:00.000Z', run_id: BEFORE, based_on: { insight_ids: ['mi-1'] }, reasoning: 'People compare before they buy.', hero_quote: null,
    }],
    rec_decisions: [],
    moves: [],
    subjects: [],
    month_denominators: ['2026-09-01', '2026-10-01'].map((month) => ({ client_id: CLIENT, month, audience: 'industry-other', videos: 300, comments: 4000, platform_mix: { tiktok: 300 }, status: 'filling', run_id: CLOSING, read_at: '2026-11-05T05:00:00.000Z' })),
    // The closing run's freeze wrote October under ITS themes only.
    month_theme_readings: [{ client_id: CLIENT, month: '2026-10-01', audience: 'industry-other', theme_id: NEW_THEME, videos: 63, platform_mix: { tiktok: 63 }, status: 'filling', run_id: CLOSING }],
    market_insights: [{ id: 'mi-1', client_id: CLIENT, run_id: BEFORE, title: 'Buyers compare on price', evidence: { supporting_theme_ids: ['ins-1', 'ins-2'] } }],
    competitive_insights: [],
    themes: [
      { id: 'th-0', client_id: CLIENT, run_id: BEFORE, created_at: '2026-10-28T05:00:00.000Z', registry_id: OLD_THEME, supporting_insight_ids: ['ins-1', 'ins-2'] },
      { id: 'th-1', client_id: CLIENT, run_id: CLOSING, created_at: '2026-11-05T05:00:00.000Z', registry_id: NEW_THEME, supporting_insight_ids: ['ins-1', 'ins-2'] },
    ],
    theme_registry: [{ id: OLD_THEME, client_id: CLIENT, canonical_label: 'Price requests before purchase' }, { id: NEW_THEME, client_id: CLIENT, canonical_label: 'Price and purchase questions' }],
    competitors: [],
    tracking_configs: [{ client_id: CLIENT, competitor_names: [], own_handles: {} }],
  }
}

describe('the leadership brief\'s "would move" is read on the run the brief is built on', () => {
  it('the closing run\'s themes, so the level is the month\'s reading and never a zero from the update before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T06:30:00.000Z'))
    const db = fakeDb(tables() as never)
    const part = await loadMovesPart(db.client as never, { clientId: CLIENT, month: '2026-10-01', runId: CLOSING })
    vi.useRealTimers()
    expect(part?.pool.map((p) => p.aim)).toEqual([{ label: 'Price and purchase questions', k: 63, n: 300, href: null }])
    expect(db.calls.find((c) => c.table === 'themes' && c.columns === 'supporting_insight_ids, registry_id')?.filters).toContain(`run_id=${CLOSING}`)
  })

  it('without the run (the page\'s rule), the update before is read: the "0 of" the brief printed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T06:30:00.000Z'))
    const db = fakeDb(tables() as never)
    const part = await loadMovesPart(db.client as never, { clientId: CLIENT, month: '2026-10-01' })
    vi.useRealTimers()
    expect(part?.pool.map((p) => p.aim)).toEqual([{ label: 'Price requests before purchase', k: 0, n: 300, href: null }])
  })
})
