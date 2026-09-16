import { describe, expect, it } from 'vitest'

import { render } from '@/lib/test/render'
import { BRIEF_CARDS, LEADERSHIP_LINE, cadenceWord, deliveryLine, type BriefCard } from '@/lib/reports/briefs'
import { BriefCards } from './brief-cards'

const card = (over: Partial<BriefCard> = {}): BriefCard => ({
  role: 'sales_brief',
  artefact: 'brief:sales',
  label: 'The sales brief',
  what: 'The objections, in the customers’ own words.',
  reportId: 'r1',
  latest: { snapshotId: 's1', title: 'Sales brief · Össur', readingLine: 'September 2026 (still filling) · read as at 16 Sep 2026' },
  cadence: 'Every update',
  recipients: [],
  sending: false,
  ...over,
})

describe('the three cards', () => {
  it('are Sales, Marketing and Content — decision R', () => {
    expect(BRIEF_CARDS.map((c) => c.role)).toEqual(['sales_brief', 'market_brief', 'content_brief'])
    expect(BRIEF_CARDS.map((c) => c.artefact)).toEqual(['brief:sales', 'brief:marketing', 'brief:content'])
  })

  it('say where the fourth is rather than leaving it withdrawn', () => {
    const html = render(<BriefCards cards={[card()]} />)
    expect(html).toContain('leadership brief')
    expect(LEADERSHIP_LINE).toContain('Studio')
  })
})

describe('deliveryLine', () => {
  it('says nobody receives it, which is true on both live workspaces today', () => {
    expect(deliveryLine({ cadence: 'Every update', recipients: [], sending: false }))
      .toBe('Every update · nobody receives this yet — add people in Settings › Reports and recipients.')
  })

  it('says there is no schedule at all where there is none', () => {
    expect(deliveryLine({ cadence: null, recipients: [], sending: false })).toContain('Not on a schedule')
  })

  it('does not claim a send that is not happening', () => {
    expect(deliveryLine({ cadence: 'Monthly', recipients: ['a@b.c'], sending: false }))
      .toBe('Monthly · 1 person listed, but nothing is being sent yet.')
    expect(deliveryLine({ cadence: 'Monthly', recipients: ['a@b.c', 'd@e.f'], sending: true }))
      .toBe('Monthly · 2 people.')
  })
})

describe('cadenceWord', () => {
  it('is the client wording, and never a raw enum where one is known', () => {
    expect(cadenceWord('every_update')).toBe('Every update')
    expect(cadenceWord('monthly')).toBe('Monthly')
    expect(cadenceWord(null)).toBeNull()
    expect(cadenceWord('weird')).toBe('weird')
  })
})

describe('the card', () => {
  it('prints the day the last one read, not the day it was built', () => {
    const html = render(<BriefCards cards={[card()]} />)
    expect(html).toContain('read as at 16 Sep 2026')
  })

  it('says it has never been built where it has not', () => {
    const html = render(<BriefCards cards={[card({ latest: null, reportId: null })]} />)
    expect(html).toContain('Never built for this workspace')
    expect(html).toContain('Set it up in the Studio')
  })

  // The horizon control that stood here highlighted a choice no route read:
  // no Studio page takes a horizon searchParam and nothing writes one into a
  // report's settings. Asserting an href substring proved the link, not the
  // behaviour.
  it('offers no window control, and says what the window is', () => {
    const html = render(<BriefCards cards={[card()]} />)
    expect(html).not.toContain('horizon=')
    for (const label of ['Last 3 months', 'Last 12 months', 'Since we started']) {
      expect(html).not.toContain(label)
    }
    expect(html).toContain('reads the month in hand')
  })
})
