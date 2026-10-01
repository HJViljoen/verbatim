import { describe, expect, it } from 'vitest'

import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { PRIVACY_LINE } from '@/lib/reading/method'
import { pastIssues, studioRows, type StudioSchedule, type StudioSend } from '@/lib/pages/studio'
import { YourReports } from './your-reports'
import { PastIssues } from './past-issues'

// The Studio's client half, as the Page-Studio artboard draws it: what each
// block PRINTS (the render tier, AGENTS.md).

const NOW = new Date('2026-10-01T12:00:00Z')
const members = [
  { email: 'daniela@sealandgear.com', full_name: 'Daniela De Siena' },
  { email: 'brayden@sealandgear.com', full_name: 'Brayden' },
]
const schedules: StudioSchedule[] = [
  { id: 's-wr', name: 'This week in your market', artefact: 'weekly_read', starter_key: 'weekly_read', recipients: ['daniela@sealandgear.com', 'brayden@sealandgear.com'], active: true },
  { id: 's-sb', name: 'The sales brief', artefact: 'brief:sales', starter_key: 'weekly_report', recipients: ['daniela@sealandgear.com'], active: false },
]
const rows = studioRows({ tenant: 'Sealand', schedules, sends: [], members, now: NOW })

/** The design bans (Heinrich, 30 Sep): no left stripe, no highlight, no em dash. */
function bans(markup: string, text: string) {
  expect(markup).not.toMatch(/border-l(-|\b)/)
  expect(markup).not.toMatch(/border-left/)
  expect(markup).not.toContain('<mark')
  expect(text).not.toContain('—')
}

describe('Your reports', () => {
  const markup = render(<YourReports rows={rows} canEdit privacy={PRIVACY_LINE} />)
  const text = renderText(<YourReports rows={rows} canEdit privacy={PRIVACY_LINE} />)

  it('prints the artboard: the head, five rows, who gets each, the latest issue, and the privacy line once', () => {
    expect(text).toContain('Your reports Report For How often Who gets it Latest issue')
    expect(text).toContain('The weekly The week in one line, what happened, what it means for Sealand, and what to watch next. Everyone Every Monday DS Daniela De Siena B Brayden First issue Mon 5 Oct Recipients')
    expect(text).toContain('Sales brief Who is buying, what holds them back, and the words to use. Sales Monthly DS Daniela De Siena First issue early October Recipients')
    expect(text).toContain('Leadership brief Where your market stands, where you stand against rivals, and the risks. Leadership, and anyone outside a team Monthly First issue early October')
    expect(text.match(/Recipients/g)).toHaveLength(5)
    expect(text.endsWith(PRIVACY_LINE)).toBe(true)
  })

  it('draws no Recipients button for someone who cannot edit', () => {
    expect(renderText(<YourReports rows={rows} canEdit={false} privacy={PRIVACY_LINE} />)).not.toContain('Recipients')
  })

  it('keeps the copy contract and the design bans, and scrolls inside the card on a phone', () => {
    assertCopyContract(markup)
    bans(markup, text)
    expect(markup).toContain('overflow-x-auto')
  })
})

describe('Past issues', () => {
  const sends: StudioSend[] = [
    { id: 'x1', schedule_id: 's-wr', schedule_name: null, snapshot_id: 'snap-1', artifact_id: null, subject: 'This week in your market', sent_at: '2026-10-05T07:10:00Z' },
    { id: 'x2', schedule_id: 's-sb', schedule_name: null, snapshot_id: 'snap-2', artifact_id: 'pdf-2', subject: 'Sales brief, September', sent_at: '2026-10-06T07:10:00Z' },
  ]
  const issues = pastIssues(sends, schedules)
  const open = (id: string) => `/dashboard/studio?view=${id}`

  it('is not drawn until an issue has gone out', () => {
    expect(render(<PastIssues issues={[]} openHref={open} />)).toBe('')
  })

  it('lists each issue newest first, with Open, the PDF where there is one, and a share link', () => {
    const markup = render(<PastIssues issues={issues} openHref={open} />)
    const text = renderText(<PastIssues issues={issues} openHref={open} />)
    expect(text).toContain('Past issues Issue Report Sent')
    expect(text.indexOf('Sales brief, September')).toBeLessThan(text.indexOf('This week in your market'))
    expect(text).toContain('Sales brief, September Sales brief Tue 6 Oct Open PDF Share link')
    expect(text).toContain('This week in your market The weekly Mon 5 Oct Open Share link')
    expect(markup).toContain('href="/dashboard/studio?view=snap-2"')
    expect(markup).toContain('href="/api/artifacts/pdf-2"')
    assertCopyContract(markup)
    bans(markup, text)
  })

  it('a build put on the platform without its email prints its day like any issue, and never how it got there (§0a.1)', () => {
    const published = pastIssues([{ id: 'p1', schedule_id: 's-wr', schedule_name: null, snapshot_id: 'snap-p', artifact_id: null, subject: 'Sealand: the week', sent_at: null, published_at: '2026-10-01T18:00:00Z' }], schedules)
    const markup = render(<PastIssues issues={published} openHref={open} />)
    const text = renderText(<PastIssues issues={published} openHref={open} />)
    expect(text).toContain('Sealand: the week The weekly Thu 1 Oct Open Share link')
    expect(text).not.toMatch(/platform|emailed/i)
    expect(text).not.toContain('PDF')
    assertCopyContract(markup)
    bans(markup, text)
  })
})
