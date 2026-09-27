import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { directionHits } from '@/lib/calibration'
import { queueLines, type QueuedRow } from '@/lib/settings/queue'
import { PAGES_CAN_SAY, timelineRows } from '@/lib/settings/record-additions'

import { ASK_FOR_A_CHANGE, HeldStillAside, PagesCanSay } from './additions'

// Settings › What we changed, what deploy 5 adds (WP3.10, §2.10 D5): the
// held-still aside and the timeline, as the SettingsRecord artboard draws them.

describe('Searches held still until January, the aside in What we changed', () => {
  const rows: QueuedRow[] = [{ field: 'industry_keywords', after: ['travel gear', 'carry-on backpack'], effective_month: '2027-01-01', queued_label: 'x', queued_at: '2026-11-22T09:00:00Z' }]
  it('says what the lock keeps, each queued change with its month, the request path and when a change lands', () => {
    const text = renderText(<HeldStillAside state="available" lines={queueLines(rows, { industry_keywords: ['upcycled bag', 'travel gear'] })} />)
    expect(text).toContain('Searches held still until January')
    expect(text).toContain('This keeps October and November comparable. A change you queue waits for the 1st.')
    expect(text).toContain('The category: adds carry-on backpack; takes out upcycled bag')
    expect(text).toContain('from 1 January 2027')
    expect(text).toContain(ASK_FOR_A_CHANGE)
    expect(text).toContain('A change lands on the 1st of a month, no earlier than 1 Jan 2027.')
  })
  it('asks for the change on What we read\'s search set', () => {
    expect(render(<HeldStillAside state="available" lines={[]} />)).toContain('href="/dashboard/settings#search-set"')
  })
  it('says none yet, and before MF3 claims no queue', () => {
    expect(renderText(<HeldStillAside state="available" lines={[]} />)).toContain('queued: none yet')
    const before = renderText(<HeldStillAside state="unavailable" lines={[]} />)
    expect(before).toContain('Tell us what you would change and we will note it for then.')
    expect(before).not.toContain('queued')
  })
  it('keeps the copy contract', () => {
    assertCopyContract(<HeldStillAside state="available" lines={[]} />)
  })
})

describe('What the pages can say, and when', () => {
  it('prints §2.11\'s rows, levels now, the first comparison read the same way on the 6 Dec update', () => {
    const text = renderText(<PagesCanSay now="2026-11-22T09:00:00Z" />)
    expect(text).toContain('Levels now. The first change we can stand behind comes in December, if nothing we search changes.')
    expect(text).toContain('6 Dec update October against November at the same age: the first comparison read the same way.')
    expect(text).toContain('April 2027 The first quarter comparison')
    // The fast track (§3.7): the re-check reads with the 4 Oct update.
    expect(text).toContain('4 Oct update The re-check on the searches both months ran')
    expect(text).not.toContain('11 Oct')
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
