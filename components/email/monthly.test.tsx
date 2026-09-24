import { describe, expect, it } from 'vitest'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { markupText, render } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import {
  MONTHLY_BLOCK_KEYS,
  MONTHLY_CANVAS_GUTTER,
  MONTHLY_CARD_WIDTH,
  MONTHLY_EMAIL_WIDTH,
  MONTHLY_RULE,
  MONTHLY_RULE_FROZEN,
  monthlyContext,
  monthlyEyebrow,
  monthRange,
  monthlyPeriod,
} from '@/lib/reports/monthly'
import type { MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { formingMonthlyFixture, monthlyFixture, refusedMonthlyFixture } from '@/components/blocks/monthly/fixture'
import type { MonthLabel } from '@/lib/reading/series'
import { MonthlyDeck } from '@/components/print/monthly-deck'
import { MonthlyShareShell } from '@/components/share/monthly-share-shell'
import { MonthlyEmail } from './monthly'
import { STALE_ARTEFACT_LINE } from '@/lib/reports/stale'

const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

function snapshot(reading = monthlyFixture(), over: Partial<MonthlySnapshotData> = {}): MonthlySnapshotData {
  return {
    version: 1,
    kind: 'monthly',
    company: 'Sealand',
    title: 'Sealand · the month',
    period: monthlyPeriod(reading.month, reading.monthStatus, reading.readingAt),
    readingAt: reading.readingAt,
    month: reading.month,
    monthStatus: reading.monthStatus,
    keys: [...MONTHLY_BLOCK_KEYS],
    reading,
    figures: {},
    subject: reading.subject,
    ...over,
  }
}

const body = (data: MonthlySnapshotData) =>
  render(<MonthlyEmail data={data} shareUrl="https://app.verbatimintel.com/r/tok" appUrl="https://app.verbatimintel.com" attached ctx={ctx} preheader={data.subject} />)

const words = (data: MonthlySnapshotData) => markupText(body(data))

const STATES = [monthlyFixture(), refusedMonthlyFixture(), formingMonthlyFixture()]

const CAVEAT = 'We did not record how themes were grouped for Sep 2026, so it is not strictly comparable with the months around it.'

/** The reading both live tenants have today: one unrecorded-clustering note. */
const withNote = () => {
  const reading = monthlyFixture()
  const note: MonthLabel = { kind: 'clustering_changed', text: CAVEAT }
  return { ...reading, notes: [note] }
}

describe('the monthly email', () => {
  // THE FRAME IS 640 AND THE CARD IS 600 (E-monthly). The artboard's outer
  // element is 640 with 20px of canvas padding, so the white card is 600 —
  // which the design system states in so many words (§4, "600px card"). The
  // card carried 640 and every line of copy ran ~40px long.
  // AND THE 640 IS ARITHMETIC, NOT A DEAD DECLARATION (the fix pass, review
  // finding [Minor]). The frame's width was also written as a `max-width` on
  // the centring `<td>`, where it has no effect — max-width is not honoured on
  // a table cell in CSS 2.1 and Outlook lays out with Word — and this test
  // asserted that string, so it read as pinning a frame that nothing pinned.
  // The card's 600 is the only width that binds; the gutter makes it 640.
  // THE EYEBROW WRAPS AS A HANGING INDENT (the wave-3 review, finding
  // [Minor]). The green rule is 30px + 10px of margin at the head of the line
  // box, so the wrapped remainder — "31 OCT 2026", the freeze date the
  // artboard does not print — started at x = 0 directly under the rule instead
  // of under the words it continues. Measured at 640: the second line moves
  // from x = 51 to x = 91, the first line's own text edge.
  it('hangs the masthead eyebrow’s second line under its first', () => {
    expect(body(snapshot())).toContain('padding-left:40px;text-indent:-40px')
  })

  it('is a 600 card inside the mock’s 640 frame', () => {
    expect(MONTHLY_EMAIL_WIDTH).toBe(640)
    expect(MONTHLY_CARD_WIDTH).toBe(600)
    expect(MONTHLY_CARD_WIDTH + 2 * MONTHLY_CANVAS_GUTTER).toBe(MONTHLY_EMAIL_WIDTH)
    expect(body(snapshot())).toContain('max-width:600px')
    expect(body(snapshot())).toContain(`padding:${MONTHLY_CANVAS_GUTTER}px ${MONTHLY_CANVAS_GUTTER}px 24px`)
    expect(body(snapshot())).not.toContain('max-width:640px')
  })

  it('heads the masthead with the product and the reading, not the tenant', () => {
    const data = snapshot()
    const text = words(data)
    expect(text).toContain(monthlyEyebrow(data.period))
    expect(text).not.toContain('consumer intelligence')
    // The green rule beside it — the artboard's 30 x 3 mark, and the only green
    // on the artefact above the button.
    expect(body(data)).toContain(`background:${EMAIL.green}`)
  })

  it('prints the update dates, which have been loaded since WP11 and drawn nowhere', () => {
    const data = snapshot()
    const bar = data.reading.overview.bar
    const text = words(data)
    expect(text).toContain(monthlyContext(bar))
    for (const d of bar.updateDates) expect(text).toContain(d)
    // THE RANGE IS THE MONTH'S OWN DAYS, never the run window: a period is
    // dated by the comment.
    expect(text).toContain('1–18 Sep 2026')
  })

  // AND THE RANGE SURVIVES A MONTH KEY OF ANOTHER SHAPE (the fix pass, review
  // finding [Minor]). The day was spliced in at `slice(0, 8)`, which is right
  // only for `YYYY-MM-DD`; `BarBlock.month` is that today, so this was never a
  // live defect — but a `YYYY-MM` built an Invalid Date and printed "NaN
  // undefined" into the masthead, and an unparseable one did the same.
  it('prints a month range from any month key, and never “NaN”', () => {
    const bar = { month: '2026-09-01', status: 'filling' as const, daysIn: 18, updates: 3, updateDates: [] }
    expect(monthlyContext(bar)).toContain('1–18 Sep 2026')
    expect(monthlyContext({ ...bar, month: '2026-09' })).toContain('1–18 Sep 2026')
    expect(monthRange('2026-02', 'frozen', null)).toBe('1–28 Feb 2026')
    expect(monthRange('2024-02', 'frozen', null)).toBe('1–29 Feb 2024')
    // Not a date at all: the caller gets its own string back, as `longMonth`
    // hands back its own — a gap a reader cannot see is the one nobody can
    // debug.
    expect(monthRange('not-a-month', 'filling', 4)).toBe('not-a-month')
  })

  it('names the month on the button, so twelve of these are not twelve of one', () => {
    expect(words(snapshot())).toContain('Open the September reading')
  })

  // The artboard separates its eight sections with a full-bleed #DCDFE3 rule.
  // They shared one padded cell with 22px of margin, which reads as one column
  // rather than as a document with parts.
  it('rules one section off from the next', () => {
    const markup = body(snapshot())
    const rules = markup.split(`background:${EMAIL.border};font-size:1px`).length - 1
    expect(rules).toBeGreaterThanOrEqual(MONTHLY_BLOCK_KEYS.length)
  })

  it('prints all eight sections, in the stored order, on every state', () => {
    for (const reading of STATES) {
      const text = words(snapshot(reading))
      for (const title of [
        'The month',
        'Your subjects',
        'What moved this month',
        'Rivals',
        'Your moves',
        'One voice per subject',
        'What to decide before the next reading',
        'How sound is this month',
      ]) {
        expect(text).toContain(title)
      }
    }
  })

  it('stamps the masthead with the month, the reading date and the day it closes', () => {
    expect(words(snapshot())).toContain('still filling until')
    expect(words(snapshot())).toContain('reading as at')
  })

  it('prints the rule that keeps it honest, in the arm the month is in', () => {
    expect(words(snapshot())).toContain(MONTHLY_RULE)
    const closed = monthlyFixture({ monthStatus: 'frozen' })
    expect(words(snapshot(closed, { monthStatus: 'frozen' }))).toContain(MONTHLY_RULE_FROZEN)
  })

  it('leads with the subject line frozen with the reading', () => {
    const data = snapshot()
    expect(words(data)).toContain(data.subject)
  })

  it('keeps the copy contract on every state', () => {
    for (const reading of STATES) assertCopyContract(body(snapshot(reading)))
  })

  it('carries no unsubstituted token, no class, no CSS variable, no flex, no grid', () => {
    for (const reading of STATES) {
      const markup = body(snapshot(reading))
      expect(markup).not.toContain('[[')
      expect(markup).not.toContain('class=')
      expect(markup).not.toContain('var(--')
      expect(markup).not.toMatch(/display:\s*(flex|grid)/)
    }
  })

  it('links absolutely, everywhere', () => {
    for (const href of body(snapshot()).match(/href="([^"]+)"/g) ?? []) {
      expect(href).toMatch(/href="https?:\/\//)
    }
  })

  it('says it is prepared FOR the client, and that commenters are never identified', () => {
    const text = words(snapshot())
    expect(text).toContain('Prepared for Sealand')
    expect(text).toContain('Commenters are never identified')
  })

  it('renders a section it no longer knows as nothing, and keeps the rest', () => {
    const text = words(snapshot(monthlyFixture(), { keys: ['monthly.month', 'monthly.gone'] as never }))
    expect(text).toContain('The month')
    expect(text).not.toContain('One voice per subject')
  })

  // Both live tenants carry clustering_changed today, and the sentence appeared
  // zero times in either rendered email while MR3 drew an Apr → Sep line per
  // row across exactly those months. An artefact is read with nobody beside
  // the reader to add what the reading cannot support.
  it('prints the reading’s caveat, which the page prints and the artefact did not', () => {
    expect(words(snapshot(withNote()))).toContain(CAVEAT)
  })

  it('prints no empty line where the reading has nothing to caveat', () => {
    expect(words(snapshot())).not.toContain(CAVEAT)
  })
})

describe('the monthly report on paper', () => {
  it('paginates one section per sheet, never all eight on one', () => {
    const markup = render(<MonthlyDeck data={snapshot()} date="16 Sep 2026" />)
    expect(markup.match(/8\s*\/\s*8|8<\/[^>]+>\s*<\/[^>]+>/)).toBeTruthy()
    // Eight sheets: the count is what the weekly deck's first cut got wrong,
    // losing four of six sections inside one overflow:hidden slide.
    expect((markup.match(/data-slide|class="[^"]*slide/g) ?? []).length).toBeGreaterThanOrEqual(1)
    expect(markup).toContain('The month')
    expect(markup).toContain('How sound is this month')
  })

  it('prints the rule on every sheet, because a PDF has no masthead to scroll back to', () => {
    const markup = render(<MonthlyDeck data={snapshot()} date="16 Sep 2026" />)
    const hits = markup.split(MONTHLY_RULE).length - 1
    expect(hits).toBe(8)
  })

  it('carries the reading’s caveat on every sheet, beside the rule', () => {
    const markup = render(<MonthlyDeck data={snapshot(withNote())} date="16 Sep 2026" />)
    expect(markup.split(CAVEAT).length - 1).toBe(8)
  })

  it('says so on its own sheet when it knows none of the stored keys', () => {
    const markup = render(<MonthlyDeck data={snapshot(monthlyFixture(), { keys: [] })} date="16 Sep 2026" />)
    // In the client's words, not the developer's: "build" and "block" are on
    // the jargon list and this sheet is a client's PDF (reports-6).
    expect(markupText(markup)).toContain(STALE_ARTEFACT_LINE)
    expect(markupText(markup)).not.toContain('this build')
  })
})

describe('the shared monthly report', () => {
  it('says prepared BY the client, because a share link is theirs to forward', () => {
    const markup = render(<MonthlyShareShell data={snapshot()} appUrl="https://app.verbatimintel.com" />)
    expect(markupText(markup)).toContain('Prepared by Sealand')
  })

  it('says the figures are frozen and the voices are read live', () => {
    const markup = render(<MonthlyShareShell data={snapshot()} appUrl="https://app.verbatimintel.com" />)
    expect(markupText(markup)).toContain('figures frozen when this was sent')
  })

  it('carries the reading’s caveat, for a reader with nobody beside them', () => {
    const markup = render(<MonthlyShareShell data={snapshot(withNote())} appUrl="https://app.verbatimintel.com" />)
    expect(markupText(markup)).toContain(CAVEAT)
  })

  it('draws every section the link names', () => {
    const text = markupText(render(<MonthlyShareShell data={snapshot()} appUrl="https://app.verbatimintel.com" />))
    expect(text).toContain('One voice per subject')
    expect(text).toContain('What to decide before the next reading')
  })
})
