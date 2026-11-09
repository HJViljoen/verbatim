import { describe, expect, it } from 'vitest'

import { runWarning, warningSentence } from '@/lib/pipeline/run-warnings'
import type { ReadinessRow } from '@/lib/readiness/types'
import { render, renderText } from '@/lib/test/render'
import { ReadinessTable } from './readiness-table'

// The ops readiness page's Updates row with a run's warnings under its line
// (9 Nov): what it PRINTS. In the redesign's style: plain sentences, sentence
// case, no mono, no " · ", nothing under 12px.

const LENS = runWarning('lens-readings', Object.assign(new Error('duplicate key value violates unique constraint "month_lens_readings_pkey"'), { code: '23505' }), { month: '2026-10-01' })
const EMBED = runWarning('embed-insights', new Error('timeout'))

const ROW: ReadinessRow = {
  id: 'update-record', block: 'Updates', input: 'a record of what ran, when, and over what stretch',
  status: 'exists', detail: '8 of the last 8 updates finished · 12 updates since 13 Sep 2026, longest gap 7 days.', owner: 'ops',
  unlocks: 'Nothing to configure.',
  notes: ['8 Nov 2026: finished · by hand', warningSentence(LENS), warningSentence(EMBED), '1 Nov 2026: finished · on schedule'],
}

describe('the Updates row with warnings', () => {
  const html = render(<ReadinessTable rows={[ROW]} title="This workspace" description="Read 9 Nov 2026." />)
  const text = renderText(<ReadinessTable rows={[ROW]} title="This workspace" description="Read 9 Nov 2026." />)

  it('prints each warning as its own line under its run, in plain sentences', () => {
    expect(text).toContain('8 Nov 2026: finished, by hand')
    expect(text).toContain('Stale data: lens readings for October 2026 did not finish (Postgres 23505: duplicate key value violates unique constraint "month_lens_readings_pkey"). The lens figures for October 2026 keep the previous update’s numbers.')
    expect(text).toContain('Housekeeping: the insight embeddings did not finish (timeout).')
    expect(text.indexOf('Stale data:')).toBeGreaterThan(text.indexOf('8 Nov 2026'))
    expect(text.indexOf('Stale data:')).toBeLessThan(text.indexOf('1 Nov 2026'))
    expect(html.match(/<li/g)).toHaveLength(4)
  })

  it('no mono, no middle dot, and no text under 12px', () => {
    expect(html).not.toMatch(/font-mono/)
    expect(text).not.toContain('·')
    const sizes = [...html.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]))
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12)
  })
})
