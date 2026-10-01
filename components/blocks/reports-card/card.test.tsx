import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { QuarterlyAbsentTile, QuarterlyCardTile, barCeiling, monthSpan, pillWord, readingWord } from './card'
import { formingCardFixture, quarterlyCardFixture, unreadCardFixture } from './fixture'
import { buildQuarterlyCard } from '@/lib/pages/reports-card'
import { previousQuarter, quarterFor } from '@/lib/reports/quarterly'

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
  // HEINRICH'S THREE-MONTH-USER TEST. Below the gate every row's badge reads
  // "not enough months yet", so the rows said nothing but that, once per
  // subject. The card now carries ONE line — when the first comparison
  // arrives — and no rows, bars, legend or caveat.
  it('shows only the gate line below six readings, with no rows', () => {
    const text = renderText(<QuarterlyCardTile card={formingCardFixture()} />)
    expect(text).toContain('arrives in April 2027')
    expect(text).not.toContain(MOVEMENT_WORDS.baseline_forming)
    expect(text).not.toContain('Durability')
    expect(text).not.toContain('bars:')
    expect(text).not.toContain('read back at setup')
    // said once: no footer copy of the same gate
    expect(text).not.toContain('Quarter against quarter needs six months')
    expect(text).not.toContain('▲')
    expect(text).not.toContain('▼')
  })

  it('shows the rows as designed once the gate is open', () => {
    const text = renderText(<QuarterlyCardTile card={quarterlyCardFixture()} />)
    expect(text).toContain('Durability')
    expect(text).toContain('bars:')
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

  it('names the record’s first comparison, and heads the card with it rather than a quarter with nothing to review (finish-list item 9)', () => {
    const text = renderText(<QuarterlyCardTile card={formingCardFixture()} />)
    expect(text).toContain('arrives in April 2027: the first quarter of 2027 against the last of 2026. You have 3 monthly readings so far.')
    expect(text).toContain('The quarterly review first in April 2027')
    expect(text).not.toMatch(/Q\d 2026 ·/)
  })

  // A workspace whose record names no pair (Össur): the artefact's own
  // arithmetic, never Sealand's April 2027; where no month is known the line
  // falls back to the count alone, under the quarter's own head.
  it('keeps the six-readings month on a workspace with no record timeline', () => {
    const month = renderText(<QuarterlyCardTile card={formingCardFixture({ sameWay: null, readingMonth: '2026-09-01' })} />)
    expect(month).toContain('arrives with the December 2026 reading: it needs six monthly readings and you have 3.')
    expect(month).toContain('The quarterly review first in December 2026')
    expect(month).not.toContain('April 2027')
    const count = renderText(<QuarterlyCardTile card={formingCardFixture({ sameWay: null })} />)
    expect(count).toContain('arrives once six monthly readings stand behind it: you have 3.')
    expect(count).toContain('Q3 2026 · Jul–Sep')
  })

  // ONE NUMBER, THREE PLACES, AND THEY AGREE. The pill was the gate CONSTANT
  // hand-typed ("Six readings stand behind it") on a card whose meta said "9
  // monthly readings" and whose footer said "you have 9" — the one numeric
  // claim on the card with no test, and wrong for every count except six.
  it('counts the readings that actually stand behind the quarter', () => {
    const text = renderText(<QuarterlyCardTile card={quarterlyCardFixture()} />)
    expect(text).toContain('9 monthly readings stand behind it')
    expect(text).not.toContain('Six readings stand behind it')
    // said ONCE, where it stands for something — never a second count the
    // first has to agree with
    expect(text.match(/monthly reading/g)?.length).toBe(1)
    expect(text).toContain('Q3 2026 · Jul–Sep')
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

  // T0a (mechanism 1; RP-25): a quarter holding a month read back at setup is
  // not compared at all. The quarter before goes, tick, line, legend and
  // badge, and with it the caveat that once explained the comparison; each
  // row keeps this quarter's level.
  it('draws no quarter before, and no caveat, where the quarter holds a month read back at setup', () => {
    const card = quarterlyCardFixture({
      monthsInQuarter: [
        { month: '2026-07-01', videos: 1290, backRead: true },
        { month: '2026-08-01', videos: 1409, backRead: false },
        { month: '2026-09-01', videos: 1448, backRead: false },
      ],
    })
    const text = renderText(<QuarterlyCardTile card={card} />)
    const html = render(<QuarterlyCardTile card={card} />)
    expect(text).not.toContain('read back at setup')
    expect(text).not.toContain('the quarter before ·')
    expect(html).not.toContain('h-2.5 w-0.5 rounded-[1px] bg-muted-foreground')
    expect(text).toContain('912 of 4,147')
    // And where the month judge refuses a step across the two quarters.
    const refused = renderText(<QuarterlyCardTile card={quarterlyCardFixture({ joined: false })} />)
    expect(refused).not.toContain('the quarter before ·')
    expect(refused).toContain('912 of 4,147')
  })

  // THE PILL'S AMBER IS IN THE TINT AND THE RING. `bg-warning/15 text-warning`
  // is 1.79:1 — the colour on a 15% tint of itself — and it carried the pill in
  // the state both live workspaces are in.
  it('does not set the state pill in warning ON warning', () => {
    const html = render(<QuarterlyCardTile card={unreadCardFixture()} />)
    expect(html).not.toContain('bg-warning/15 text-warning')
    expect(html).toContain('bg-warning/15 text-foreground ring-1 ring-warning/50')
  })

  // A LEGEND KEYS WHAT IS DRAWN. Below the gate `quarterChange` carries no
  // baseline, so no row has a tick — and the second swatch was drawn on
  // `series.length > 0`, promising a mark nowhere on the card.
  it('keys the tick only where the chart draws one', () => {
    // The legend's second swatch is the only `h-2.5 w-0.5` mark outside a bar;
    // below the gate there are no bars and no legend at all.
    const forming = render(<QuarterlyCardTile card={formingCardFixture()} />)
    expect(forming).not.toContain('bars:')
    expect(forming).not.toContain('h-2.5 w-0.5')
    const full = render(<QuarterlyCardTile card={quarterlyCardFixture()} />)
    expect(full).toContain('h-2.5 w-0.5 rounded-[1px] bg-muted-foreground')
  })

  // A 2.0% SHARE DREW AS A FULL BAR. Scaled against the largest level on the
  // card, a lone row is always its own maximum (Sealand's Price, "1 of 49").
  // One printed scale now covers every bar and every tick.
  it('draws a lone small share as a sliver on a printed scale, with its tick on the same scale', () => {
    const card = quarterlyCardFixture({
      subjects: [{ id: 's1', name: 'Price' }],
      thisQuarter: { denominators: [{ audience: INDUSTRY_AUDIENCE, videos: 49, comments: 0, platform_mix: {}, dual_mention: 0, excluded_undated: 0 }], themes: [] },
      lastQuarter: { denominators: [{ audience: INDUSTRY_AUDIENCE, videos: 7, comments: 0, platform_mix: {}, dual_mention: 0, excluded_undated: 0 }], themes: [] },
      subjectsNow: [{ audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: 1, comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 }],
      subjectsBefore: [{ audience: INDUSTRY_AUDIENCE, subject_id: 's1', videos: 1, comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0 }],
    })
    const html = render(<QuarterlyCardTile card={card} />)
    const fill = html.match(/width:\s*([\d.]+)%/)
    expect(Number(fill?.[1])).toBeCloseTo((100 / 49 / 25) * 100, 1)
    expect(Number(fill?.[1])).toBeLessThan(10)
    const tick = html.match(/left:\s*calc\(([\d.]+)% - 1px\)/)
    expect(Number(tick?.[1])).toBeCloseTo((100 / 7 / 25) * 100, 1)
    expect(renderText(<QuarterlyCardTile card={card} />)).toContain('scale 0–25%')
  })

  // The bars are levels beside each other, not a line through time: one
  // series, named, with the quarter before it marked as a tick.
  it('names the one series it draws rather than promising two', () => {
    const text = renderText(<QuarterlyCardTile card={quarterlyCardFixture()} />)
    expect(text).toContain('the category')
    expect(text).not.toContain('your audience')
  })
})

// THE CARD IS NEVER SIMPLY ABSENT. `loadQuarterlyCard` answers null where no
// subject is confirmed — the state both live workspaces are in today — and the
// page then said nothing at all about the artefact it exists to advertise.
describe('the quarterly card’s absence', () => {
  it('keeps the copy contract and names what a reader can act on', () => {
    assertCopyContract(<QuarterlyAbsentTile />)
    const text = renderText(<QuarterlyAbsentTile />)
    expect(text).toContain('none is confirmed for this workspace yet')
    expect(text).toContain('Name a subject on Subjects')
  })

  // No date, no count, and nothing about a quarter nobody has read — the same
  // rule the card itself is built under.
  it('promises nothing', () => {
    const text = renderText(<QuarterlyAbsentTile />)
    expect(text).not.toMatch(/Ready\s+\d/)
    expect(text).not.toMatch(/\d/)
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

  // SAID ONCE. Below the gate every row's badge already reads "not enough
  // months yet" and the footnote carries the gate sentence, so a pill saying it
  // a fourth time is the loudest thing on the card in the state Sealand is in.
  it('says nothing below the gate, where the rows have already said it', () => {
    expect(pillWord(3, true)).toBeNull()
    expect(pillWord(3, false)).toBe('nothing to compare yet')
    expect(pillWord(9, false)).toBe('nothing to compare yet')
  })
})

describe('barCeiling', () => {
  it('never lets the largest bar be its own full width', () => {
    expect(barCeiling([2])).toBe(25)
    expect(barCeiling([])).toBe(25)
    expect(barCeiling([22, 18])).toBe(25)
    expect(barCeiling([27.1, 14])).toBe(30)
    expect(barCeiling([99])).toBe(100)
    expect(barCeiling([Number.NaN, 3])).toBe(25)
  })
})

// DECISION C ON THE CARD (WP1.1 review, finding 2). Staging's real windows for
// Sealand (read 26 Sep): Q3 875 category videos, Q2 49; Looks & style 136 and
// 5, Community & purpose 12 and 1, Repair & warranty 46 and 6. Staging has
// four readings, where the card prints only its gate line, so the gate is held
// open here at six, as it is from the November reading.
describe('the quarterly card under the three calibration states', () => {
  const window = (videos: number) => ({
    denominators: [{ audience: INDUSTRY_AUDIENCE, videos, comments: 0, platform_mix: {}, dual_mention: 0, excluded_undated: 0 }],
    themes: [],
  })
  const subjectRows = (videos: Record<string, number>) =>
    Object.entries(videos).map(([subject_id, v]) => ({
      audience: INDUSTRY_AUDIENCE, subject_id, videos: v, comments: 0, platform_mix: {}, excluded_on_camera: 0, excluded_undated: 0,
    }))
  const quarter = quarterFor(2026, 3)
  const card = buildQuarterlyCard({
    quarter,
    prior: previousQuarter(quarter),
    subjects: [
      { id: 'looks', name: 'Looks & style', calibration: 'ready' },
      { id: 'community', name: 'Community & purpose', calibration: 'provisional' },
      { id: 'repair', name: 'Repair & warranty', calibration: 'failed' },
    ],
    thisQuarter: window(875),
    lastQuarter: window(49),
    subjectsNow: subjectRows({ looks: 136, community: 12, repair: 46 }),
    subjectsBefore: subjectRows({ looks: 5, community: 1, repair: 6 }),
    monthsInQuarter: [
      { month: '2026-07-01', videos: 35, backRead: true },
      { month: '2026-08-01', videos: 351, backRead: false },
      { month: '2026-09-01', videos: 625, backRead: false },
    ],
    readings: 6,
  })!

  // T0a (RP-26; ruling U6): a provisional subject's bar rests on its
  // unverified matching and goes, as a failed one's always did.
  it('prints a ready subject\'s bar unmarked, and no provisional or failed one', () => {
    const text = renderText(<QuarterlyCardTile card={card} />)
    expect(text).toContain('136 of 875')
    expect(text).not.toContain('Community & purpose')
    expect(text).not.toContain('12 of 875')
    expect(text).not.toContain('provisional')
    expect(text).not.toContain('Repair & warranty')
    expect(text).not.toContain('46 of 875')
    assertCopyContract(<QuarterlyCardTile card={card} />)
  })
})
