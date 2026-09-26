import { describe, expect, it } from 'vitest'

import { heldStillLine, queueLines, queueSummary, type QueuedRow } from '@/lib/settings/queue'
import { renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'

import { HeldStillSection } from './held-still'

// Settings › Tracking, "Held still until January" (WP3.10): a queued edit shows
// the month it lands in, never before January 2027.

const STORED = { industry_keywords: ['upcycled bag', 'travel gear'] }
const ROWS: QueuedRow[] = [{
  field: 'industry_keywords', after: ['travel gear', 'carry-on backpack'], effective_month: '2027-01-01',
  queued_label: 'daniela@sealand.example · queued for the 1st', queued_at: '2026-11-22T09:00:00Z',
}]

describe('HeldStillSection', () => {
  it('prints each waiting change with its month and who queued it', () => {
    const lines = queueLines(ROWS, STORED)
    const text = renderText(<HeldStillSection line={heldStillLine('available')} summary={queueSummary(lines, '2026-11-24T00:00:00Z')} lines={lines} />)
    expect(text).toContain('Held still until January')
    expect(text).toContain('no earlier than 1 January 2027')
    expect(text).toContain('queued for January: 1 change')
    expect(text).toContain('The category: adds carry-on backpack; takes out upcycled bag')
    expect(text).toContain('from 1 January 2027 · queued 22 Nov by daniela@sealand.example')
  })

  it('says none yet when nothing waits', () => {
    const text = renderText(<HeldStillSection line={heldStillLine('available')} summary={queueSummary([], '2026-11-24T00:00:00Z')} lines={[]} />)
    expect(text).toContain('queued for January: none yet')
  })

  it('before MF3, says what deploy 1 said and claims no queue', () => {
    const text = renderText(<HeldStillSection line={heldStillLine('unavailable')} summary={null} lines={[]} />)
    expect(text).toContain('tell us and we will note it for then')
    expect(text).not.toContain('queued')
  })

  it('keeps the copy contract, and carries no em dash', () => {
    const markup = <HeldStillSection line={heldStillLine('available')} summary="queued for January: none yet" lines={queueLines(ROWS, STORED)} />
    assertCopyContract(markup)
    expect(renderText(markup)).not.toContain('—')
  })
})
