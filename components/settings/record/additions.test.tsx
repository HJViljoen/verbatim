import { describe, expect, it } from 'vitest'

import { renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { directionHits } from '@/lib/calibration'
import { queueLines, type QueuedRow } from '@/lib/settings/queue'
import { PAGES_CAN_SAY, timelineRows } from '@/lib/settings/record-additions'

import { ASK_FOR_A_CHANGE, PagesCanSay, SearchesHeldStill } from './additions'

// Settings › What we changed, deploy 5's three sections (WP3.10, §2.10 D5).

describe('Searches held still until January', () => {
  const rows: QueuedRow[] = [{ field: 'industry_keywords', after: ['travel gear', 'carry-on backpack'], effective_month: '2027-01-01', queued_label: 'x', queued_at: '2026-11-22T09:00:00Z' }]
  it('says what the lock does, with its request path, and each queued change with its month', () => {
    const text = renderText(<SearchesHeldStill state="available" lines={queueLines(rows, { industry_keywords: ['upcycled bag', 'travel gear'] })} />)
    expect(text).toContain('Searches held still until January')
    expect(text).toContain('lands on the 1st of a month, no earlier than 1 January 2027')
    expect(text).toContain('The category: adds carry-on backpack; takes out upcycled bag')
    expect(text).toContain('from 1 January 2027')
    expect(text).toContain(ASK_FOR_A_CHANGE)
  })
  it('says none yet, and before MF3 claims no queue', () => {
    expect(renderText(<SearchesHeldStill state="available" lines={[]} />)).toContain('queued: none yet')
    const before = renderText(<SearchesHeldStill state="unavailable" lines={[]} />)
    expect(before).toContain('tell us and we will note it for then')
    expect(before).not.toContain('queued')
  })
  it('keeps the copy contract', () => {
    assertCopyContract(<SearchesHeldStill state="available" lines={[]} />)
  })
})

describe('What the pages can say, and when', () => {
  it('prints §2.11\'s rows, levels now, the first comparison read the same way on the 6 Dec update', () => {
    const text = renderText(<PagesCanSay now="2026-11-22T09:00:00Z" />)
    expect(text).toContain('Levels now. The first change we can stand behind comes in December, if nothing we search changes.')
    expect(text).toContain('6 Dec update October against November at the same age: the first comparison read the same way.')
    expect(text).toContain('April 2027 The first quarter comparison')
  })
  it('marks the next row by the clock', () => {
    expect(timelineRows('2026-11-22T09:00:00Z').find((r) => r.state === 'next')?.when).toBe('6 Dec update')
    expect(timelineRows('2027-05-01T00:00:00Z').every((r) => r.state === 'reached')).toBe(true)
  })
  it('carries no direction word and no em dash, and keeps the copy contract', () => {
    for (const r of PAGES_CAN_SAY) {
      expect(directionHits(r.says)).toEqual([])
      expect(r.says).not.toContain('—')
    }
    assertCopyContract(<PagesCanSay now="2026-11-22T09:00:00Z" />)
  })
})
