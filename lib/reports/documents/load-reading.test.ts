import { describe, expect, it } from 'vitest'

import { chartLead } from './load-reading'

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
