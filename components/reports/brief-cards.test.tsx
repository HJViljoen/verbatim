import { describe, expect, it } from 'vitest'

import { render } from '@/lib/test/render'
import { BRIEFS_META, BRIEF_CARDS, LEADERSHIP_LINE, briefMonthChip, briefReader, briefStamp, cadenceWord, cardSending, deliveryLine, latestBriefLine, type BriefCard } from '@/lib/reports/briefs'
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
  scheduleKnown: true,
  everBuilt: true,
  poolCappedAt: null,
  // The artboard's four elements (Block D wave 2): the role pill, the mono
  // month chip, the figures the last build froze and the footer's stamp.
  reader: 'the people who talk to customers',
  monthChip: 'September 2026 (still filling)',
  figures: [
    { key: 'client_share_pct', label: 'Your share of the category', value: '3.4%' },
    { key: 'videos', label: 'Videos read', value: '1,388' },
  ],
  pdf: { id: 'a1', bytes: 240_000, stale: false },
  stamp: 'read as at 16 Sep',
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

  // A failed read and a workspace with no schedule rendered the same card.
  it('does not turn a failed schedule read into "not on a schedule"', () => {
    const line = deliveryLine({ cadence: null, recipients: [], sending: false, scheduleKnown: false })
    expect(line).not.toContain('Not on a schedule')
    expect(line).toContain('could not read')
  })

  it('does not claim a send that is not happening', () => {
    expect(deliveryLine({ cadence: 'Monthly', recipients: ['a@b.c'], sending: false }))
      .toBe('Monthly · 1 person listed, but nothing is being sent yet.')
    expect(deliveryLine({ cadence: 'Monthly', recipients: ['a@b.c', 'd@e.f'], sending: true }))
      .toBe('Monthly · 2 people.')
  })
})

// A card must not claim a send the send path cannot make: Settings gates on
// BUILDABLE_ARTEFACTS (['weekly']) and Reports did not, so an armed brief:sales
// schedule would have had one page say "Every update · 4 people" and the other
// say nothing sends it — and what went out would be the weekly report under
// the sales brief's name.
describe('cardSending', () => {
  const armed = { active: true, recipients: ['a@b.c'], period: 'weekly' }

  it('is false for a brief, because no schedule can send one yet', () => {
    expect(cardSending({ artefact: 'brief:sales', ...armed })).toBe(false)
    expect(cardSending({ artefact: 'brief:marketing', ...armed })).toBe(false)
    expect(cardSending({ artefact: 'brief:content', ...armed })).toBe(false)
  })

  it('is true only for a buildable artefact with people, active, unpaused', () => {
    expect(cardSending({ artefact: 'weekly', ...armed })).toBe(true)
    expect(cardSending({ artefact: 'weekly', ...armed, period: 'paused' })).toBe(false)
    expect(cardSending({ artefact: 'weekly', ...armed, recipients: [] })).toBe(false)
    expect(cardSending({ artefact: 'weekly', ...armed, active: false })).toBe(false)
  })
})

// "NEVER BUILT FOR THIS WORKSPACE" IS A CLAIM ABOUT THE WORKSPACE and the
// card's `latest` comes from a query capped at 100 snapshots — the defect the
// archive one section down already fixed with listCap and emptyGroupLine.
describe('latestBriefLine', () => {
  const none = { latest: null, everBuilt: null, poolCappedAt: null }

  it('prints the reading line where there is a build to point at', () => {
    expect(latestBriefLine(card())).toContain('read as at 16 Sep 2026')
  })

  it('claims nothing was ever built only where the pool searched everything', () => {
    expect(latestBriefLine(none)).toContain('Never built for this workspace')
    expect(latestBriefLine({ ...none, everBuilt: false })).toContain('Never built for this workspace')
  })

  it('says what was searched where the pool was capped', () => {
    const line = latestBriefLine({ ...none, poolCappedAt: 100 })
    expect(line).toBe('Not among the 100 most recent builds we looked at.')
    expect(line).not.toContain('Never built')
  })

  it('never says "never built" about a report row that names a snapshot', () => {
    const line = latestBriefLine({ ...none, everBuilt: true, poolCappedAt: 100 })
    expect(line).toContain('Built before')
    expect(line).not.toContain('Never built')
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
  // WHEN IT READ MOVED TO THE FOOTER AND THE MONTH TO THE CHIP (Block D wave
  // 2). The artboard's card puts a mono month top-right and a mono stamp in
  // the hairline footer, so the full `readingLine` — month, filling, and the
  // full date in one string — no longer fits on a 389px card and is split
  // across the two slots the mock draws. The clock is still named
  // ("read as at", never a bare date), which is the half of `readingLine` the
  // product cannot lose.
  it('prints the day the last one read, and says which clock that is', () => {
    const html = render(<BriefCards cards={[card()]} />)
    expect(html).toContain('read as at 16 Sep')
    expect(html).toContain('September 2026 (still filling)')
  })

  // The month chip never drops "(still filling)": a bare "September" over a
  // part-month lets a reader take it for the month.
  it('keeps the filling flag on the month chip', () => {
    const html = render(<BriefCards cards={[card({ monthChip: 'September 2026 (still filling)' })]} />)
    expect(html).toContain('(still filling)')
  })

  it('says it has never been built where it has not', () => {
    const html = render(<BriefCards cards={[card({ latest: null, reportId: null, everBuilt: null, figures: [], pdf: null, monthChip: null, stamp: null })]} />)
    expect(html).toContain('Never built for this workspace')
    expect(html).toContain('Set it up in the Studio')
  })

  // A card with no build has no PDF to download and no snapshot to share, and
  // the mock draws both on every card. A link that opens nothing is the same
  // defect as the window control below.
  it('draws no PDF and no share link where there is no build', () => {
    const html = render(<BriefCards cards={[card({ latest: null, figures: [], pdf: null })]} />)
    expect(html).not.toContain('/api/artifacts/')
    expect(html).not.toContain('Share link')
  })

  // The figure rows are the archive detail pane's own markup, lifted onto the
  // card — and they are FIGURES, not levels: `sentFigures` values are the
  // strings a document printed and the denominators behind them are not in the
  // snapshot, so no node here claims a level it cannot evidence.
  it('prints the figures the last build froze, and claims no level', () => {
    const html = render(<BriefCards cards={[card()]} />)
    expect(html).toContain('Your share of the category')
    expect(html).toContain('3.4%')
    expect(html).toContain('data-copy="figure"')
    expect(html).not.toContain('data-copy="level"')
  })

  // The horizon control that stood here highlighted a choice no route read:
  // no Studio page takes a horizon searchParam and nothing writes one into a
  // report's settings. Asserting an href substring proved the link, not the
  // behaviour.
  //
  // The section meta it was replaced by moved again in wave 2: it is a prop
  // now, and the page passes `BRIEFS_META`, because "rebuilt with every
  // monthly reading" (the mock's words) is a claim about a cadence no code
  // keeps — no `brief:*` key is in BUILDABLE_ARTEFACTS.
  it('offers no window control, and claims no cadence it cannot keep', () => {
    const html = render(<BriefCards cards={[card()]} meta={BRIEFS_META} />)
    expect(html).not.toContain('horizon=')
    for (const label of ['Last 3 months', 'Last 12 months', 'Since we started']) {
      expect(html).not.toContain(label)
    }
    expect(html).toContain(BRIEFS_META)
    expect(BRIEFS_META).not.toContain('rebuilt')
  })

  // The Studio is hidden from tenants (owner's call, 2026-09-17) and that
  // includes copy naming it — the card's own action, not only the page bar's
  // pill.
  it('shows no door into the Studio where the session may not see one', () => {
    const html = render(<BriefCards cards={[card()]} studio={false} />)
    expect(html).not.toContain('/dashboard/studio')
  })
})

describe('briefReader', () => {
  it("is the audience's own words, not the mock's persona", () => {
    expect(briefReader('brief:sales')).toBe('the people who talk to customers')
    expect(briefReader('brief:marketing')).toBe('the people who act on it')
    expect(briefReader('brief:content')).toBe('the people who make things')
    expect(briefReader('weekly')).toBeNull()
  })
})

describe('briefMonthChip', () => {
  it('keeps "(still filling)" and answers nothing where no month was named', () => {
    expect(briefMonthChip({ at: '2026-09-16T00:00:00Z', inferred: false, month: 'September 2026', monthStatus: 'filling' }))
      .toBe('September 2026 (still filling)')
    expect(briefMonthChip({ at: '2026-09-16T00:00:00Z', inferred: false, month: 'August 2026', monthStatus: 'frozen' }))
      .toBe('August 2026')
    expect(briefMonthChip({ at: '2026-09-16T00:00:00Z', inferred: true, month: null, monthStatus: null })).toBeNull()
    expect(briefMonthChip(null)).toBeNull()
  })
})

describe('briefStamp', () => {
  it('names the clock, because a bare date says neither', () => {
    expect(briefStamp({ at: '2026-09-16T00:00:00Z', inferred: false, month: null, monthStatus: null })).toBe('read as at 16 Sep')
    expect(briefStamp({ at: '2026-09-16T00:00:00Z', inferred: true, month: null, monthStatus: null })).toBe('built 16 Sep')
    expect(briefStamp(null)).toBeNull()
  })
})
