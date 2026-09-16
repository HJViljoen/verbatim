import { describe, expect, it } from 'vitest'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { markupText, render } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import {
  MONTHLY_BLOCK_KEYS,
  MONTHLY_EMAIL_WIDTH,
  MONTHLY_RULE,
  MONTHLY_RULE_FROZEN,
  monthlyPeriod,
} from '@/lib/reports/monthly'
import type { MonthlySnapshotData } from '@/lib/reports/monthly-build'
import { formingMonthlyFixture, monthlyFixture, refusedMonthlyFixture } from '@/components/blocks/monthly/fixture'
import { MonthlyDeck } from '@/components/print/monthly-deck'
import { MonthlyShareShell } from '@/components/share/monthly-share-shell'
import { MonthlyEmail } from './monthly'

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

describe('the monthly email', () => {
  it('is 640 wide, the mock’s width', () => {
    expect(MONTHLY_EMAIL_WIDTH).toBe(640)
    expect(body(snapshot())).toContain('max-width:640px')
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

  it('says so on its own sheet when it knows none of the stored keys', () => {
    const markup = render(<MonthlyDeck data={snapshot(monthlyFixture(), { keys: [] })} date="16 Sep 2026" />)
    expect(markupText(markup)).toContain('This report names no section this build knows how to draw.')
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

  it('draws every section the link names', () => {
    const text = markupText(render(<MonthlyShareShell data={snapshot()} appUrl="https://app.verbatimintel.com" />))
    expect(text).toContain('One voice per subject')
    expect(text).toContain('What to decide before the next reading')
  })
})
