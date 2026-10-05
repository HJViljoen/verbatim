import { describe, expect, it } from 'vitest'

import {
  BRIEFS_BUILT, STUDIO_REPORTS, firstBriefMonth, initialsOf, issueDay, nextMonday, operatorOnlyRedirect, pastIssues, personOf, shownStudioRows, studioArtefactOf, studioRows,
  type StudioSchedule, type StudioSend,
} from './studio'

// The Studio's client half (Page-Studio artboard): the five rows, who gets
// each, the latest issue, and the past issues. Pure.

// Thu 1 Oct 2026, 14:00 SAST.
const NOW = new Date('2026-10-01T12:00:00Z')
const members = [
  { email: 'daniela@sealandgear.com', full_name: 'Daniela De Siena' },
  { email: 'brayden@sealandgear.com', full_name: 'Brayden' },
]
const weeklyRead: StudioSchedule = {
  id: 's-wr', name: 'This week in your market', artefact: 'weekly_read', starter_key: 'weekly_read',
  recipients: ['daniela@sealandgear.com', 'brayden@sealandgear.com'], active: true,
}
const digest: StudioSchedule = {
  id: 's-dg', name: 'Weekly digest', artefact: 'weekly', starter_key: 'weekly_report', recipients: ['daniela@sealandgear.com'], active: true,
}

describe('the five reports', () => {
  it('are the artboard\'s rows, in its order, with its words', () => {
    const rows = studioRows({ tenant: 'Sealand', schedules: [weeklyRead, digest], sends: [], members, now: NOW })
    expect(rows.map((r) => r.name)).toEqual(['The weekly', 'Sales brief', 'Marketing brief', 'Content brief', 'Leadership brief'])
    expect(rows.map((r) => r.forWho)).toEqual(['Everyone', 'Sales', 'Marketing', 'Content', 'Leadership, and anyone outside a team'])
    expect(rows.map((r) => r.howOften)).toEqual(['Every Monday', 'Monthly', 'Monthly', 'Monthly', 'Monthly'])
    expect(rows[0].what).toBe('The week in one line, what happened, what it means for Sealand, and what to watch next.')
    expect(STUDIO_REPORTS).toHaveLength(5)
  })

  it('names who gets each from the team, in the stored order, and the weekly is the written read, not the digest', () => {
    const [weekly, sales] = studioRows({ tenant: 'Sealand', schedules: [digest, weeklyRead], sends: [], members, now: NOW })
    expect(weekly.people.map((p) => [p.initials, p.name])).toEqual([['DS', 'Daniela De Siena'], ['B', 'Brayden']])
    expect(weekly.recipients).toEqual(weeklyRead.recipients)
    expect(sales.people).toEqual([])
    expect(sales.scheduled).toBe(false)
  })

  it('prints an address where the recipient is not on the team', () => {
    expect(personOf('press@agency.example', members)).toEqual({ name: 'press@agency.example', initials: 'P', email: 'press@agency.example' })
  })

  it('latest issue: the newest issue\'s day; else the weekly\'s first Monday where it sends; else early in the briefs\' month', () => {
    const none = studioRows({ tenant: 'Sealand', schedules: [weeklyRead], sends: [], members, now: NOW })
    expect(none[0].latest).toBe('First issue Mon 5 Oct')
    expect(none.slice(1).map((r) => r.latest)).toEqual(Array(4).fill('First issue early October'))

    const sent: StudioSend[] = [
      { id: 'x1', schedule_id: 's-wr', schedule_name: null, snapshot_id: 'snap-1', artifact_id: null, subject: 'This week in your market', sent_at: '2026-10-05T07:10:00Z' },
      { id: 'x2', schedule_id: 's-wr', schedule_name: null, snapshot_id: 'snap-2', artifact_id: null, subject: 'This week in your market', sent_at: '2026-10-12T07:10:00Z' },
    ]
    expect(studioRows({ tenant: 'Sealand', schedules: [weeklyRead], sends: sent, members, now: NOW })[0].latest).toBe('Mon 12 Oct')

    // A weekly that sends nobody, or is off, promises no first issue.
    const off = { ...weeklyRead, active: false }
    expect(studioRows({ tenant: 'Sealand', schedules: [off], sends: [], members, now: NOW })[0].latest).toBeNull()
    expect(studioRows({ tenant: 'Sealand', schedules: [], sends: [], members, now: NOW })[0].latest).toBeNull()
  })

  it('reads a schedule\'s artefact from its starter where the column is empty', () => {
    expect(studioArtefactOf({ artefact: null, starter_key: 'weekly_read' })).toBe('weekly_read')
    expect(studioArtefactOf({ artefact: 'brief:sales', starter_key: null })).toBe('brief:sales')
    expect(studioArtefactOf({ artefact: 'weekly', starter_key: 'weekly_report' })).toBeNull()
  })
})

describe('dates in the Studio\'s zone', () => {
  it('nextMonday: the coming Monday, or today on a Monday, by the South African calendar', () => {
    expect(issueDay(nextMonday(NOW))).toBe('Mon 5 Oct')
    expect(issueDay(nextMonday(new Date('2026-10-05T06:00:00Z')))).toBe('Mon 5 Oct')
    // Sunday 23:30 UTC is already Monday in Johannesburg.
    expect(issueDay(nextMonday(new Date('2026-10-04T23:30:00Z')))).toBe('Mon 5 Oct')
    expect(issueDay(nextMonday(new Date('2026-12-29T10:00:00Z')))).toBe('Mon 4 Jan')
  })

  it('firstBriefMonth: this month in its first week, the next after it', () => {
    expect(firstBriefMonth(NOW)).toBe('October')
    expect(firstBriefMonth(new Date('2026-10-07T20:00:00Z'))).toBe('October')
    expect(firstBriefMonth(new Date('2026-10-08T10:00:00Z'))).toBe('November')
    expect(firstBriefMonth(new Date('2026-12-20T10:00:00Z'))).toBe('January')
  })

  it('initials as the artboard draws them', () => {
    expect(initialsOf('Daniela De Siena')).toBe('DS')
    expect(initialsOf('Brayden')).toBe('B')
    expect(initialsOf('')).toBe('?')
  })
})

describe('past issues', () => {
  it('lists every sent issue newest first, named by its report, with what opens it', () => {
    const sends: StudioSend[] = [
      { id: 'a', schedule_id: 's-dg', schedule_name: null, snapshot_id: 'snap-a', artifact_id: 'pdf-a', subject: null, sent_at: '2026-09-21T07:00:00Z' },
      { id: 'b', schedule_id: 's-wr', schedule_name: null, snapshot_id: 'snap-b', artifact_id: null, subject: 'This week in your market', sent_at: '2026-10-05T07:00:00Z' },
      { id: 'c', schedule_id: null, schedule_name: 'An old schedule', snapshot_id: null, artifact_id: null, subject: 'Your update', sent_at: '2026-08-01T07:00:00Z' },
    ]
    const issues = pastIssues(sends, [weeklyRead, digest])
    expect(issues.map((i) => [i.title, i.report, i.sentOn])).toEqual([
      ['This week in your market', 'The weekly', 'Mon 5 Oct'],
      ['Weekly report', 'Weekly report', 'Mon 21 Sep'],
      ['Your update', 'An old schedule', 'Sat 1 Aug'],
    ])
    expect(issues[1]).toMatchObject({ snapshotId: 'snap-a', artifactId: 'pdf-a' })
  })
})

describe('past issues: a build put on the platform without its email (the backfill, 1 Oct)', () => {
  const published: StudioSend = { id: 'p', schedule_id: 's-wr', schedule_name: null, snapshot_id: 'snap-p', artifact_id: null, subject: 'Sealand: the week', sent_at: null, published_at: '2026-10-01T18:00:00Z' }
  const sent: StudioSend = { id: 's', schedule_id: 's-wr', schedule_name: null, snapshot_id: 'snap-s', artifact_id: 'pdf-s', subject: 'Sealand: the next week', sent_at: '2026-10-05T07:00:00Z' }

  it('is listed by when it reached the platform, and prints that day like any issue (never how it got there)', () => {
    const issues = pastIssues([published, sent], [weeklyRead])
    expect(issues.map((i) => [i.id, i.sentOn])).toEqual([['s', 'Mon 5 Oct'], ['p', 'Thu 1 Oct']])
    expect(issues[1]).toMatchObject({ snapshotId: 'snap-p', artifactId: null, sentAt: '2026-10-01T18:00:00Z' })
    expect(issues.map((i) => i.sentOn).join(' ')).not.toMatch(/platform|emailed/i)
  })

  it('a publish late in the UTC day prints the South African day', () => {
    expect(pastIssues([{ ...published, published_at: '2026-10-01T22:30:00Z' }], [weeklyRead])[0].sentOn).toBe('Fri 2 Oct')
  })

  it('a published build that was emailed afterwards prints its email\'s day', () => {
    expect(pastIssues([{ ...published, sent_at: '2026-10-05T07:00:00Z' }], [weeklyRead])[0].sentOn).toBe('Mon 5 Oct')
  })

  // 5 Oct: the row never contradicts the list. A published issue is the
  // weekly's latest issue, by the day it reached the platform.
  it('is the weekly\'s latest issue, as the past issues date it', () => {
    const rows = studioRows({ tenant: 'Sealand', schedules: [weeklyRead], sends: [published], members, now: NOW })
    expect(rows.find((r) => r.artefact === 'weekly_read')?.latest).toBe('Thu 1 Oct')
    // The newer of a published and a sent issue, whichever way it got there.
    expect(studioRows({ tenant: 'Sealand', schedules: [weeklyRead], sends: [published, sent], members, now: NOW })[0].latest).toBe('Mon 5 Oct')
    const laterPublished = { ...published, id: 'p2', published_at: '2026-10-12T05:00:00Z' }
    expect(studioRows({ tenant: 'Sealand', schedules: [weeklyRead], sends: [sent, laterPublished], members, now: NOW })[0].latest).toBe('Mon 12 Oct')
    // With nobody on the list, a published issue is still the latest (no "First issue" promise needed).
    expect(studioRows({ tenant: 'Ossur', schedules: [{ ...weeklyRead, recipients: [] }], sends: [published], members, now: NOW })[0].latest).toBe('Thu 1 Oct')
  })
})

describe('the operator-only routes', () => {
  it('let the operator through and send anyone else to the Studio', () => {
    expect(operatorOnlyRedirect({ operator: { viewingClientId: 'x' } })).toBeNull()
    expect(operatorOnlyRedirect({ operator: null })).toBe('/dashboard/studio')
  })
})

describe('the rows the Studio shows (Heinrich, 1 Oct)', () => {
  it('the weekly alone until the briefs are built; all five once they are', () => {
    const rows = studioRows({ tenant: 'Sealand', schedules: [weeklyRead, digest], sends: [], members, now: NOW })
    expect(BRIEFS_BUILT).toBe(false)
    expect(shownStudioRows(rows).map((r) => r.name)).toEqual(['The weekly'])
    expect(shownStudioRows(rows, true)).toHaveLength(5)
  })
})
