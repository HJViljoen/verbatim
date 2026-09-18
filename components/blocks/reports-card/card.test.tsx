import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { QuarterlyCardTile, monthSpan, pillWord, readingWord } from './card'
import { formingCardFixture, quarterlyCardFixture, unreadCardFixture } from './fixture'

// The render tier for the quarterly card (Block D wave 2, package E-reports).
// One static render per state, asserted against the copy contract — and three
// states, because two of them are what a live workspace looks like today.

describe('the quarterly card', () => {
  it('keeps the copy contract in all three states', () => {
    assertCopyContract(<QuarterlyCardTile card={quarterlyCardFixture()} />)
    assertCopyContract(<QuarterlyCardTile card={formingCardFixture()} />)
    assertCopyContract(<QuarterlyCardTile card={unreadCardFixture()} />)
  })

  // D12, and the sharpest deviation on the whole artboard: the mock prints
  // "▲ 5 pts" and "▼ 3 pts" on a card whose own footer says three readings of
  // six. Below the gate every `quarterChange` answers `baseline_forming`, so
  // every badge reads the product's word for it.
  it('prints the gate word on every row below six readings, and no arrow', () => {
    const text = renderText(<QuarterlyCardTile card={formingCardFixture()} />)
    expect(text).toContain(MOVEMENT_WORDS.baseline_forming)
    expect(text).not.toContain('▲')
    expect(text).not.toContain('▼')
  })

  // NO PROMISED CALENDAR DATE, ANYWHERE. `lib/schedules/due.ts` fires the
  // quarterly on the first UPDATE of a new calendar quarter, so "Ready 1 Oct"
  // is a claim about a cadence nothing guarantees. This is the test the brief
  // asks to fail the build if one ever appears.
  it('never promises a date', () => {
    for (const card of [quarterlyCardFixture(), formingCardFixture(), unreadCardFixture()]) {
      const text = renderText(<QuarterlyCardTile card={card} />)
      expect(text).not.toMatch(/Ready\s+\d/)
      expect(text).not.toMatch(/\bReady\s+\d{1,2}\s+\w{3}/)
    }
  })

  // Every level with its "of N" — the pair, in one cell, so a narrow layout
  // cannot drop the denominator down a column.
  it('prints every level with what it is out of, on both sides', () => {
    const text = renderText(<QuarterlyCardTile card={quarterlyCardFixture()} />)
    expect(text).toMatch(/of 4,147/)
    // The side it is compared WITH carries its own counts, so the claim the
    // badge makes is checkable rather than asserted.
    expect(text).toContain('the quarter before')
    expect(text).toMatch(/of 3,810/)
  })

  // The gate sentence is the artefact's own, verbatim, so the card and the
  // document one click away cannot print different numbers under it.
  it('carries the artefact’s own gate sentence in the footer', () => {
    expect(renderText(<QuarterlyCardTile card={formingCardFixture()} />))
      .toContain('Quarter against quarter needs six months — you have 3.')
  })

  // ONE NUMBER, THREE PLACES, AND THEY AGREE. The pill was the gate CONSTANT
  // hand-typed ("Six readings stand behind it") on a card whose meta said "9
  // monthly readings" and whose footer said "you have 9" — the one numeric
  // claim on the card with no test, and wrong for every count except six.
  it('counts the readings that actually stand behind the quarter', () => {
    const text = renderText(<QuarterlyCardTile card={quarterlyCardFixture()} />)
    expect(text).toContain('9 monthly readings stand behind it')
    expect(text).not.toContain('Six readings stand behind it')
    // and the count it states is the count its own meta states
    expect(text.match(/9 monthly readings/g)?.length).toBeGreaterThanOrEqual(2)
  })

  // A card that has cleared the gate does not footer with the gate: "needs six
  // months — you have 9" under nine readings is a refusal printed on a card
  // that is not refusing.
  it('drops the gate sentence once the gate is open', () => {
    expect(renderText(<QuarterlyCardTile card={quarterlyCardFixture()} />))
      .not.toContain('Quarter against quarter needs six months')
  })

  // THE REFUSED STATE NAMES ITS OWN CAUSE. M3/M4 unapplied is not a shortage
  // of months: the pill said "not enough months yet" and the footer added "you
  // have 3" over a body correctly saying the reading is not recorded, so two
  // of three statements sent a reader off to wait for months that will not, on
  // their own, change anything.
  it('does not blame the reading count for an absent reading', () => {
    const text = renderText(<QuarterlyCardTile card={unreadCardFixture()} />)
    expect(text).toContain('not recorded for this workspace yet')
    expect(text).not.toContain(MOVEMENT_WORDS.baseline_forming)
    expect(text).not.toContain('you have 3')
    expect(text).toContain('nothing to compare yet')
  })

  // M3/M4 unapplied is not an empty quarter. The card says the reading is not
  // recorded and draws no bar, rather than adding three month rows together.
  it('says the reading is not recorded rather than drawing a zero', () => {
    const html = render(<QuarterlyCardTile card={unreadCardFixture()} />)
    expect(html).toContain('not recorded for this workspace yet')
    expect(html).not.toContain('data-copy="level"')
  })

  // The caveat is measured, not written: a month read back at setup and a
  // month under the band's minimum are two different facts and the card says
  // both.
  it('names the months the quarter cannot stand on', () => {
    const text = renderText(<QuarterlyCardTile card={formingCardFixture()} />)
    expect(text).toContain('read back at setup')
    expect(text).toContain('July 2026')
  })

  // The bars are levels beside each other, not a line through time: one
  // series, named, with the quarter before it marked as a tick.
  it('names the one series it draws rather than promising two', () => {
    const text = renderText(<QuarterlyCardTile card={quarterlyCardFixture()} />)
    expect(text).toContain('the category')
    expect(text).not.toContain('your audience')
  })
})

describe('monthSpan', () => {
  it('is the quarter’s own two month names', () => {
    expect(monthSpan('2026-07-01', '2026-09-30')).toBe('Jul–Sep')
    expect(monthSpan('2026-07-01', '2026-07-31')).toBe('Jul')
  })
})

describe('readingWord', () => {
  it('counts the readings the gate is about', () => {
    expect(readingWord(1)).toBe('1 monthly reading')
    expect(readingWord(3)).toBe('3 monthly readings')
  })
})

describe('pillWord', () => {
  it('states the count it has, never the count the gate asks for', () => {
    expect(pillWord(9, true)).toBe('9 monthly readings stand behind it')
    expect(pillWord(6, true)).toBe('6 monthly readings stand behind it')
    expect(pillWord(12, true)).toBe('12 monthly readings stand behind it')
  })

  it('is the gate word below the gate, and the cause where nothing was drawn', () => {
    expect(pillWord(3, true)).toBe(MOVEMENT_WORDS.baseline_forming)
    expect(pillWord(3, false)).toBe('nothing to compare yet')
    expect(pillWord(9, false)).toBe('nothing to compare yet')
  })
})
