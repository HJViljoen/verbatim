import { describe, expect, it, vi } from 'vitest'

// The front page's loader is a spy here, so the brief's call to it can be read
// (WP3.11). Everything else in the module is the real one.
vi.mock('../../pages/overview', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../pages/overview')>()), loadOverview: vi.fn() }))

import { loadOverview } from '../../pages/overview'
import { briefLead, chartLead, loadBriefOverview } from './load-reading'
import { marketFrontFixture } from '../../../components/pages/overview/fixture'

// The pure half of the brief's document figures. The I/O around it (the
// switching pool, the readiness read) is glue and is not mocked here; what is
// tested is the logic that decides what the slide says.

const row = (label: string, spark: (number | null)[]) => ({
  label,
  spark,
  sparkMonths: ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'],
})

describe('chartLead', () => {
  it('names the subject and the category, because the numbers are the subject’s', () => {
    const lead = chartLead([row('Durability', [18, 19, 19.5, 20])], 'the prosthetics conversation')
    // `SubjectRow.spark` is one subject's share of the category month, so a
    // label of the category's name alone put the wrong name over the line.
    expect(lead?.label).toBe('Durability · the prosthetics conversation')
    expect(lead?.points).toEqual([18, 19, 19.5, 20])
  })

  it('takes the first row that actually has a series, never the first row', () => {
    const lead = chartLead([row('Sizing and fit', [null, null, null, null]), row('Durability', [18, 19, 19.5, 20])], 'the category')
    // Taken blind, a lead whose spark is all nulls draws a chart with nothing
    // in it — the guard the quarterly already applies, applied here.
    expect(lead?.label).toBe('Durability · the category')
  })

  it('is null where no subject carries a month series at all', () => {
    expect(chartLead([], 'the category')).toBeNull()
    expect(chartLead([row('Sizing and fit', [null, null])], 'the category')).toBeNull()
  })
})

// DECISION C (WP1.1): the slide's line never leads with a subject that is not
// ready; a row stored before WP1.1 carries no state and is eligible.
describe('chartLead under the three calibration states', () => {
  it('steps over a provisional or failed subject to the first ready one', () => {
    const lead = chartLead([
      { ...row('Community & purpose', [0, 0, 0, 0]), calibration: 'provisional' },
      { ...row('Repair & warranty', [null, null, null, null]), calibration: 'failed' },
      { ...row('Looks & style', [null, null, 10.5, 16.3]), calibration: 'ready' },
    ], 'the category')
    expect(lead?.label).toBe('Looks & style · the category')
  })

  it('is null where only provisional or failed subjects carry a series', () => {
    expect(chartLead([{ ...row('Community & purpose', [0, 0, 0, 0]), calibration: 'provisional' }], 'the category')).toBeNull()
  })
})

// WP3.11: a brief's front page is Your market. The market-first sections draw
// its board and asks and the first In short tile is its lead, and only the
// market front page carries them; the Phase 1 page (no `marketFront`) left
// every new section empty and the lead tile on the gap.
describe('loadBriefOverview', () => {
  it('builds the front page as Your market, the way its route does', async () => {
    vi.mocked(loadOverview).mockResolvedValueOnce(marketFrontFixture())
    const scope = { supabase: {}, clientId: 'c1', params: { month: '2026-09-01' } }
    const data = await loadBriefOverview(scope as never)
    expect(vi.mocked(loadOverview)).toHaveBeenCalledWith(scope, { marketFront: true })
    // What the new sections and the lead tile read is there.
    expect(data?.themes?.rows.length).toBeGreaterThan(0)
    expect(data?.asks?.lists.length).toBeGreaterThan(0)
    expect(briefLead(data!)).toMatchObject({ kind: 'theme', label: 'Confusion over airline bag sizes' })
  })
})
