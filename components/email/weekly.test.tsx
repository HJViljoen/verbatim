import { describe, expect, it } from 'vitest'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { markupText, render } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { STALE_ARTEFACT_LINE } from '@/lib/reports/stale'
import { WEEKLY_BLOCK_KEYS, WEEKLY_CANVAS_GUTTER, WEEKLY_CARD_WIDTH, WEEKLY_EMAIL_WIDTH, WEEKLY_TITLE, weeklyPeriod, weeklySubject } from '@/lib/reports/weekly'
import { WEEKLY_SNAPSHOT_VERSION, isWeeklyData, staleWeeklySnapshot, type WeeklySnapshotData } from '@/lib/reports/weekly-build'
import { ossurWeeklyFixture, weeklyFixture } from '@/components/blocks/weekly/fixture'
import { WeeklyDeck } from '@/components/print/weekly-deck'
import { WeeklyShareShell } from '@/components/share/weekly-share-shell'
import { WeeklyEmail } from './weekly'

const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

function snapshot(reading = weeklyFixture(), over: Partial<WeeklySnapshotData> = {}): WeeklySnapshotData {
  return {
    version: WEEKLY_SNAPSHOT_VERSION,
    kind: 'weekly',
    company: reading.brand,
    title: WEEKLY_TITLE,
    period: weeklyPeriod(reading.window, reading.month),
    readingAt: reading.readingAt,
    month: reading.month,
    keys: [...WEEKLY_BLOCK_KEYS],
    reading,
    figures: {},
    subject: weeklySubject(reading.brand, reading.cameIn),
    ...over,
  }
}

const body = (data: WeeklySnapshotData) =>
  render(<WeeklyEmail data={data} shareUrl="https://app.verbatimintel.com/r/tok" appUrl="https://app.verbatimintel.com" attached ctx={ctx} preheader={data.subject} />)

/** The words a reader reads (a heading is uppercased by CSS, not by React). */
const words = (data: WeeklySnapshotData) => markupText(body(data)).replace(/\s+([,.)”:;])/g, '$1')

describe('"Your market this week" as an email (market-first WP3.7)', () => {
  it('is a column of 600 cards on the preview’s 640 canvas', () => {
    expect(WEEKLY_EMAIL_WIDTH).toBe(640)
    expect(WEEKLY_CARD_WIDTH + 2 * WEEKLY_CANVAS_GUTTER).toBe(WEEKLY_EMAIL_WIDTH)
    expect(body(snapshot())).toContain('max-width:600px')
  })

  it('opens on the masthead’s one line and the market’s level, as the preview does', () => {
    const text = words(snapshot())
    expect(text).toContain('Verbatim Sealand Your market this week September 2026 as at the 20 Sep update · next update Sun 27 Sep')
    expect(text).toContain('Your market in September so far: 654 videos. The 20 Sep update brought in 436 of them, with 9,471 comments.')
    expect(text).not.toContain('so far, ')
    expect(text).not.toContain('still filling')
  })

  it('prints the seven sections in the preview’s order, then the two buttons and whose report it is', () => {
    const text = words(snapshot())
    const at = ['With this update', 'The market by subject', 'What your market talked about', 'For sales', 'Worth a reply', 'What changed, and what is ours', 'Open Your market', 'Open This week', 'Prepared for Sealand with Verbatim']
      .map((t) => text.indexOf(t))
    expect(at.every((x) => x >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it('prints no "how sound", no rule, no unusual-week gate and no Phase 1 section, in the email, the PDF or the share page', () => {
    const data = snapshot()
    const surfaces = [
      body(data),
      render(<WeeklyDeck data={data} date="22 Sep 2026" />),
      render(<WeeklyShareShell data={data} appUrl="https://app.verbatimintel.com" />),
    ]
    for (const markup of surfaces) {
      const text = markupText(markup)
      expect(text).not.toMatch(/how sound/i)
      expect(text).not.toContain('Every number below is this month so far')
      expect(text).not.toContain('Unusual this week')
      expect(text).not.toContain('Coverage')
    }
  })

  it('keeps the copy contract and stays email-safe, on both tenants', () => {
    for (const reading of [weeklyFixture(), ossurWeeklyFixture()]) {
      const markup = body(snapshot(reading))
      assertCopyContract(markup)
      expect(markup).not.toContain('var(--')
    }
  })

  it('prints a sentence, not a stack trace, for a row an older build wrote', () => {
    const old = { ...snapshot(), version: 2 } as WeeklySnapshotData
    expect(staleWeeklySnapshot(old)).toBe(STALE_ARTEFACT_LINE)
    for (const markup of [body(old), render(<WeeklyDeck data={old} date="22 Sep 2026" />), render(<WeeklyShareShell data={old} appUrl="https://app.verbatimintel.com" />)]) {
      expect(markupText(markup)).toContain(STALE_ARTEFACT_LINE)
    }
    // A version 2 reading, as a build before WP3.7 froze it: no field the
    // renderers read is there, and nothing throws.
    const v2 = { ...snapshot(), version: 2, reading: { brand: 'Sealand', section1: {}, incoming: {}, coverage: {} } } as unknown as WeeklySnapshotData
    expect(() => body(v2)).not.toThrow()
  })

  it('honours an arrangement that names fewer sections, and drops a retired key', () => {
    const text = words(snapshot(weeklyFixture(), { keys: ['weekly.week', 'weekly.coverage', 'weekly.sales'] as never }))
    expect(text).toContain('For sales')
    expect(text).not.toContain('The market by subject')
  })
})

describe('isWeeklyData', () => {
  it('tells a weekly artefact from an arranged report, by kind alone', () => {
    expect(isWeeklyData(snapshot())).toBe(true)
    expect(isWeeklyData({ kind: 'monthly' })).toBe(false)
    expect(isWeeklyData({ ...snapshot(), version: 2 })).toBe(true)
  })
})
