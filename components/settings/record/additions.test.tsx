import { describe, expect, it } from 'vitest'

import { renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { directionHits } from '@/lib/calibration'
import { queueLines, type QueuedRow } from '@/lib/settings/queue'
import { checkMethods, PAGES_CAN_SAY, timelineRows } from '@/lib/settings/record-additions'

import { ASK_FOR_A_CHANGE, HowWeCheck, PagesCanSay, SearchesHeldStill } from './additions'

// Settings › What we changed, deploy 5's three sections (WP3.10, §2.10 D5).

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'
const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

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

describe('How we check, mark and file videos', () => {
  // The change log's rows for the three methods (WP1.4's scripts on staging, 26 Sep).
  const log = [
    { surface: 'gate_rule', changed_at: '2026-09-25T16:18:47Z' },
    { surface: 'attribution', changed_at: '2026-09-25T18:00:00Z' },
    { surface: 'segment', changed_at: '2026-09-26T10:00:00Z' },
    { surface: 'terms', changed_at: '2026-09-17T09:00:00Z' },
  ]
  it('names the three methods, what each does now and when we last changed it', () => {
    const text = renderText(<HowWeCheck methods={checkMethods(SEALAND, log)} />)
    expect(text).toContain('How we decide what is relevant')
    expect(text).toContain('changed by us 25 Sep')
    expect(text).toContain('How we mark makers’ videos')
    expect(text).toContain('They stay in every count')
    expect(text).toContain('changed by us 26 Sep')
    expect(text).toContain('How we file a video to a brand')
  })
  it('says so where no maker rule is on (Össur) and where nothing of ours is on record', () => {
    const text = renderText(<HowWeCheck methods={checkMethods(OSSUR, [])} />)
    expect(text).toContain('No maker rule is switched on for this workspace')
    expect(text).toContain('no change of ours on record')
  })
  it('keeps the copy contract', () => {
    assertCopyContract(<HowWeCheck methods={checkMethods(SEALAND, log)} />)
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
