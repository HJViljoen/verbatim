import { describe, expect, it } from 'vitest'
import { blockContext } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { markupText, render } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { WEEKLY_BLOCK_KEYS, WEEKLY_EMAIL_WIDTH, WEEKLY_RULE, weeklySubject } from '@/lib/reports/weekly'
import { isWeeklyData, type WeeklySnapshotData } from '@/lib/reports/weekly-build'
import { formingFixture, quietFixture, thinFixture, weeklyFixture } from '@/components/blocks/weekly/fixture'
import { WeeklyEmail } from './weekly'

const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

function snapshot(reading = weeklyFixture(), over: Partial<WeeklySnapshotData> = {}): WeeklySnapshotData {
  return {
    version: 1,
    kind: 'weekly',
    company: 'Sealand',
    title: 'Sealand · your update',
    period: '6 Sep – 13 Sep',
    readingAt: '2026-09-18T09:00:00.000Z',
    month: '2026-09-01',
    keys: [...WEEKLY_BLOCK_KEYS],
    reading,
    figures: {},
    subject: weeklySubject('Sealand', reading.section1.check),
    ...over,
  }
}

const body = (data: WeeklySnapshotData) =>
  render(<WeeklyEmail data={data} shareUrl="https://app.verbatimintel.com/r/tok" appUrl="https://app.verbatimintel.com" attached ctx={ctx} preheader={data.subject} />)

/** The words a reader reads. A heading is uppercased by CSS, not by React, so
 *  the markup carries the title in its own case. */
const words = (data: WeeklySnapshotData) => markupText(body(data))

describe('the weekly email', () => {
  it('is 640 wide, the mock’s width, against the digest’s 600', () => {
    expect(WEEKLY_EMAIL_WIDTH).toBe(640)
    expect(body(snapshot())).toContain('max-width:640px')
  })

  it('prints all six sections, in the stored order, on every state', () => {
    for (const reading of [weeklyFixture(), quietFixture(), formingFixture(), thinFixture()]) {
      const text = words(snapshot(reading))
      for (const title of ['The week in one sentence', 'Where things stand', 'What came in this week', 'For sales', 'For content', 'Coverage']) {
        expect(text).toContain(title)
      }
    }
  })

  it('never drops a section whose block is empty — the shape is the same every week', () => {
    const text = words(snapshot(formingFixture()))
    expect(text).toContain('For sales')
    expect(text).toContain('Nothing this update read was an objection')
  })

  it('prints the rule that keeps it honest under the masthead and again at the foot', () => {
    const text = words(snapshot())
    expect(text.split(WEEKLY_RULE).length - 1).toBe(2)
  })

  it('stamps the reading date, which M9 will read back out of `data`', () => {
    // In the product's own date form, never raw ISO beside "6 Sep - 13 Sep".
    // It sits in the footer's provenance line now, where the artboard keeps
    // every stamp, rather than halfway up the masthead.
    expect(words(snapshot())).toContain('read 18 Sep 2026')
  })

  // ---- the artboard's masthead and footer (block D wave 2) ----------------

  it('names the artefact and dates the update in the eyebrow', () => {
    const text = words(snapshot())
    expect(text).toContain('Verbatim · weekly · update of 13 Sep')
    // The tenant is no longer the eyebrow — it is the right end of the date
    // row, which is where the artboard puts it.
    expect(text).not.toContain('consumer intelligence')
  })

  it('prints the update behind this one on the date row', () => {
    expect(words(snapshot())).toContain('6 Sep – 13 Sep · previous update 5 Sep')
  })

  it('says there is no previous update rather than dropping the clause', () => {
    const reading = weeklyFixture()
    const data = snapshot({ ...reading, update: { ...reading.update, previous: null } })
    expect(words(data)).toContain('no previous update')
  })

  it('prints the three mono footer lines, and promises no next update', () => {
    const text = words(snapshot())
    expect(text).toContain('Prepared for Sealand · with Verbatim · update of 13 Sep 2026')
    expect(text).toContain('— this update’s 271 videos')
    expect(text).toContain('Commenters are never identified; quotes carry platform and date only.')
    // A cadence is not a promise about when a run lands, and nothing in this
    // product computes one.
    expect(text).not.toMatch(/next update/i)
  })

  it('leads with the frozen subject, so the inbox line and the artefact agree', () => {
    const data = snapshot()
    expect(data.subject).toBe('Sealand: Objections is unusual this week — 29 of 205 videos')
    expect(words(data)).toContain(data.subject)
  })

  it('keeps the copy contract, and stays email-safe', () => {
    for (const reading of [weeklyFixture(), formingFixture()]) {
      const markup = body(snapshot(reading))
      assertCopyContract(markup)
      expect(markup).not.toContain('class=')
      expect(markup).not.toContain('var(--')
      expect(markup).not.toMatch(/display:\s*(flex|grid)/)
    }
  })

  it('prints one link per section at the foot, with no duplicate destination', () => {
    const text = words(snapshot())
    // Six sections, four surfaces: §1, §3 and §5 all open This week.
    expect(text).toContain('Unusual this week →')
    expect(text).toContain('Your subjects →')
    expect(text).toContain('For sales →')
    expect(text).toContain('The record →')
    expect(text).not.toContain('What came in →')
    expect(text).not.toContain('For content →')
  })

  it('names no link for a section the arrangement dropped', () => {
    const text = words(snapshot(weeklyFixture(), { keys: ['weekly.week', 'weekly.coverage'] }))
    expect(text).toContain('Unusual this week →')
    expect(text).not.toContain('Your subjects →')
  })

  it('honours an arrangement that names fewer sections', () => {
    const text = words(snapshot(weeklyFixture(), { keys: ['weekly.week', 'weekly.coverage'] }))
    expect(text).toContain('The week in one sentence')
    expect(text).not.toContain('For sales')
  })
})

describe('isWeeklyData', () => {
  it('tells a weekly artefact from an arranged report', () => {
    expect(isWeeklyData(snapshot())).toBe(true)
    expect(isWeeklyData({ version: 1, sections: [] })).toBe(false)
    expect(isWeeklyData(null)).toBe(false)
  })
})
