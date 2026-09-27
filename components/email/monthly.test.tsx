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
  monthlyStamp,
  monthlyTitle,
} from '@/lib/reports/monthly'
import { MONTHLY_SNAPSHOT_VERSION, type MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { filledSlotsFixture, monthlyFixture, ossurMonthlyFixture, unmeasuredMonthlyFixture } from '@/components/blocks/monthly/fixture'
import { MonthlyDeck } from '@/components/print/monthly-deck'
import { monthlySections } from '@/components/blocks/monthly'
import { monthlyViewerPages } from '@/lib/reports/viewer'
import { MonthlyShareShell } from '@/components/share/monthly-share-shell'
import { renderMonthlyEmail } from '@/lib/email/monthly'
import { MonthlyEmail } from './monthly'
import { STALE_ARTEFACT_LINE } from '@/lib/reports/stale'
import { sealandReading } from '@/lib/test/reading-fixture'
import { buildThemeBoard, heroLead } from '@/lib/pages/overview-market'

const APP = 'https://app.verbatimintel.com'
const ctx = blockContext(APP, EMAIL)

function snapshot(reading = monthlyFixture(), over: Partial<MonthlySnapshotData> = {}): MonthlySnapshotData {
  return {
    version: MONTHLY_SNAPSHOT_VERSION,
    kind: 'monthly',
    company: reading.brand,
    title: monthlyTitle(reading.month),
    period: monthlyStamp(reading.month, reading.readTo),
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

const body = (data: MonthlySnapshotData, shareUrl: string | null = `${APP}/r/tok`) =>
  render(<MonthlyEmail data={data} shareUrl={shareUrl} appUrl={APP} attached ctx={ctx} preheader={data.subject} />)

const words = (data: MonthlySnapshotData) => markupText(body(data))

const STATES = [monthlyFixture(), unmeasuredMonthlyFixture(), ossurMonthlyFixture(), filledSlotsFixture()]

/** Where each section's title first appears in the email's words. */
const order = (text: string, titles: readonly string[]): number[] => titles.map((t) => text.indexOf(t))

describe('the monthly email: "September in your market"', () => {
  it('is a 600 column inside the artboard’s 640 canvas', () => {
    expect(MONTHLY_CARD_WIDTH + 2 * MONTHLY_CANVAS_GUTTER).toBe(MONTHLY_EMAIL_WIDTH)
    expect(body(snapshot())).toContain(`max-width:${MONTHLY_CARD_WIDTH}px`)
  })

  it('heads the masthead with the product, the tenant, the heading and the update the month was read to', () => {
    const text = words(snapshot())
    expect(text).toContain('Verbatim')
    expect(text).toContain('Sealand')
    expect(text).toContain('September in your market')
    expect(text).toContain('September 2026')
    expect(text).toContain('read to the 4 Oct update')
    expect(text).not.toContain('still filling')
    expect(text).not.toContain('reading as at')
  })

  // Plan §3.7 option (b), decided 26 Sep: sent Tue 6 Oct, read to the 4 Oct
  // update, and the next one a month on by the same rule.
  it('reads every date on the fast track’s calendar: read to the 4 Oct update, the next on Tue 3 Nov', () => {
    for (const data of [snapshot(), snapshot(filledSlotsFixture())]) {
      const text = words(data)
      expect(text).toMatch(/September 2026[\s·]*read to the 4 Oct update/)
      expect(text).toMatch(/Next: “October in your market”\s*, read to the 1 Nov update, on Tue 3 Nov\./)
      expect(text).not.toMatch(/11 Oct|12 Oct|8 Nov|9 Nov/)
    }
  })

  // Beside the send's 6 Oct clock, not in place of it (plan §3.7's list; the
  // deploy-3 fresh review): a monthly built after a later update, a re-send
  // after 11 Oct, stamps that update and still promises October on the
  // 1 Nov update, on Tue 3 Nov.
  it('built at the 12 Oct clock, reads to the 11 Oct update and keeps the same Next: line', () => {
    const at = '2026-10-12T06:00:00.000Z'
    const base = monthlyFixture()
    const reading = sealandReading(at, '2026-09')
    expect(reading.month).toBe('2026-09-01')
    const later = monthlyFixture({ readingAt: at, readTo: reading.readTo, overview: { ...base.overview, reading } })
    const text = words(snapshot(later))
    expect(text).toMatch(/September 2026[\s·]*read to the 11 Oct update/)
    expect(text).not.toContain('read to the 4 Oct update')
    expect(text).toMatch(/Next: “October in your market”\s*, read to the 1 Nov update, on Tue 3 Nov\./)
  })

  // A theme August did not read (the lead's "·" ruling of 27 Sep; the
  // deploy-3 fresh review): Össur's staging themes with "Brand boycott over
  // politics" (16, no August row) among the three named. The board prints
  // "·" for it and the page's line "none"; the month's table did too little,
  // an empty cell under "Aug of 537".
  it('marks a named theme August did not read "·" in the month’s table, never an empty cell', () => {
    const base = ossurMonthlyFixture()
    const o = base.overview
    const three = ['Admiration for personal resilience', 'Questions about prosthetic function', 'Brand boycott over politics']
    const board = { ...buildThemeBoard(o.themes!.rows.filter((t) => three.includes(t.label)), 338, o.month, 'no_rule', { month: '2026-08-01', n: 537 }), chip: o.themes!.chip }
    const hero = heroLead(board, [], new Set())
    expect(hero.kind === 'themes' && hero.top.map((t) => t.label)).toEqual(three)
    const data = ossurMonthlyFixture({ overview: { ...o, themes: board, hero } })
    const text = words(snapshot(data))
    const table = text.slice(text.indexOf('Admiration for personal resilience'), text.indexOf('Brand boycott over politics') + 40)
    expect(table).toMatch(/Admiration for personal resilience\s+34\s+16%/)
    expect(table).toMatch(/Brand boycott over politics\s+16\s+·/)
  })

  it('leads the inbox with the market, never a change (the subject line)', () => {
    const data = snapshot()
    expect(data.subject).toBe('Sealand · September in your market: 655 videos')
    expect(renderMonthlyEmail({ data, shareUrl: null, appUrl: APP, attached: false }).subject).toBe(data.subject)
    expect(body(data)).toContain(data.subject)
  })

  it('prints the sections present, in the front page’s order, and leaves out the slots no package has filled', () => {
    const text = words(snapshot())
    const titles = ['The month', 'What your market talked about', 'What people did in the comments', 'What your market asked, complained about and wished for', 'The market by subject', 'What changed, and what is ours', 'What to decide']
    const at = order(text, titles)
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    for (const absent of ['With this update', 'What it means for you', 'Brands in your market']) expect(text).not.toContain(absent)
  })

  it('prints every section once the four slots are filled', () => {
    const text = words(snapshot(filledSlotsFixture()))
    const titles = ['The month', 'What your market talked about', 'With this update', 'What people did in the comments', 'What your market asked, complained about and wished for', 'The market by subject', 'What it means for you', 'Brands in your market', 'What changed, and what is ours', 'What to decide']
    const at = order(text, titles)
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('draws one card a section, the masthead sharing the first', () => {
    const cards = (html: string) => (html.match(/class="vb-m-card"/g) ?? []).length
    // Seven sections present, the first inside the masthead's card, and the buttons' card.
    expect(cards(body(snapshot()))).toBe(7 + 1)
    expect(cards(body(snapshot(filledSlotsFixture())))).toBe(10 + 1)
  })

  it('names the month on the button and opens the app on it, and offers the share page only with a link', () => {
    const html = body(snapshot())
    expect(markupText(html)).toContain('Open September in Verbatim')
    expect(html).toContain(`href="${APP}/dashboard?month=2026-09"`)
    expect(markupText(html)).toContain('Open the share page')
    expect(markupText(body(snapshot(), null))).not.toContain('Open the share page')
    expect(markupText(html)).toContain('The PDF of this report is attached.')
  })

  it('closes with whose report it is and why the reader has it', () => {
    const text = words(snapshot())
    expect(text).toContain('Sealand · September in your market · sent with Verbatim')
    expect(text).toContain('an owner or admin changes it in the Studio.')
  })

  it('keeps the copy contract, and prints no token, CSS variable, flex, grid or “how sound”', () => {
    for (const reading of STATES) {
      const html = body(snapshot(reading))
      assertCopyContract(html)
      expect(html).not.toContain('[[')
      expect(html).not.toContain('var(--')
      expect(html).not.toMatch(/display:\s*(flex|grid)/)
      expect(html.toLowerCase()).not.toContain('how sound')
      expect(html).not.toContain('—')
    }
  })

  it('links absolutely, everywhere', () => {
    for (const reading of STATES) {
      for (const href of body(snapshot(reading)).match(/href="([^"]+)"/g) ?? []) {
        expect(href.startsWith('href="https://')).toBe(true)
      }
    }
  })

  it('prints a version 1 row as the stale line, and asks no section to draw it', () => {
    const v1 = { ...snapshot(), version: 1, keys: ['monthly.month', 'monthly.movers', 'monthly.sound'] } as MonthlySnapshotData
    const text = words(v1)
    expect(text).toContain(STALE_ARTEFACT_LINE)
    expect(text).not.toContain('What your market talked about')
  })

  it('carries the one media query a phone reads, and no other stylesheet', () => {
    const html = body(snapshot())
    expect(html).toContain('@media only screen and (max-width: 480px)')
    expect((html.match(/<style/g) ?? []).length).toBe(1)
  })
})

describe('"September in your market" on paper', () => {
  it('paginates one present section per sheet, and gives an absent slot no sheet', () => {
    const markup = render(<MonthlyDeck data={snapshot()} date="6 Oct 2026" />)
    expect((markup.match(/vb-slide/g) ?? []).length).toBeGreaterThanOrEqual(7)
    expect(markup).not.toContain('With this update')
    expect(markupText(markup)).toContain('September 2026 · read to the 4 Oct update')
  })

  it('prints the stale line on its own sheet for a version 1 row', () => {
    const v1 = { ...snapshot(), version: 1 } as MonthlySnapshotData
    expect(markupText(render(<MonthlyDeck data={v1} date="6 Oct 2026" />))).toContain(STALE_ARTEFACT_LINE)
  })

  it('says so on its own sheet when it knows none of the stored keys', () => {
    const none = snapshot(monthlyFixture(), { keys: ['monthly.movers'] as never })
    expect(markupText(render(<MonthlyDeck data={none} date="6 Oct 2026" />))).toContain(STALE_ARTEFACT_LINE)
  })

  // The Reports viewer's "N pages" is the deck's own count: an absent slot has
  // no sheet, and a row this build cannot draw is one sheet.
  it('is counted for the Reports viewer as the deck paginates it', () => {
    const sheets = (data: MonthlySnapshotData) => (render(<MonthlyDeck data={data} date="6 Oct 2026" />).match(/<section class="vb-slide[" ]/g) ?? []).length
    const cases = [
      snapshot(),
      snapshot(filledSlotsFixture()),
      snapshot(ossurMonthlyFixture()),
      { ...snapshot(), version: 1 } as MonthlySnapshotData,
      snapshot(monthlyFixture(), { keys: ['monthly.movers'] as never }),
    ]
    for (const data of cases) expect(monthlyViewerPages(data, monthlySections)).toBe(sheets(data))
    expect(monthlyViewerPages(snapshot(), monthlySections)).toBe(7)
    expect(monthlyViewerPages(snapshot(filledSlotsFixture()), monthlySections)).toBe(10)
  })
})

describe('the shared "September in your market"', () => {
  it('heads the page as the email heads it, and draws the present sections', () => {
    const text = markupText(render(<MonthlyShareShell data={snapshot()} appUrl={APP} />))
    expect(text).toContain('September in your market')
    expect(text).toContain('read to the 4 Oct update')
    expect(text).toContain('What your market talked about')
    expect(text).toContain('What to decide')
    expect(text).not.toContain('Brands in your market')
    expect(text.toLowerCase()).not.toContain('how sound')
  })

  it('prints the stale line for a version 1 row', () => {
    const v1 = { ...snapshot(), version: 1 } as MonthlySnapshotData
    const text = markupText(render(<MonthlyShareShell data={v1} appUrl={APP} />))
    expect(text).toContain(STALE_ARTEFACT_LINE)
    expect(text).not.toContain('What your market talked about')
  })
})
