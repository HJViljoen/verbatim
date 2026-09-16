import { describe, expect, it } from 'vitest'

import type { ConfigChange } from '../config-log'
import type { ReadinessRow } from '../readiness/types'
import type { UpdateInput } from '../readiness/types'
import {
  ARTEFACTS, isArtefact, isBuildable, notBuiltYet, recipientRows, sendingSummary, unnamedSchedules,
  type ScheduleLike,
} from './artefacts'
import {
  actorWords, breakClause, monthsOfRange, readChangeLog, renderSide, showingLine, CHANGE_LOG_ROWS,
} from './change-log'
import { deliveryRecord, updatesInMonth } from './delivery'
import {
  appealKey, gateSummary, gateTotals, gateTotalsFrom, keptByCommunity, keptByPlatform, keptByTerm,
  sampleNote, GATE_SAMPLE, REJECT_ROWS,
  type GateVerdict,
} from './reject-log'
import { clientReadiness, withheldLine } from './readiness-view'
import { termDates, termDateWords } from './terms'

// ---- artefacts --------------------------------------------------------------

const schedule = (over: Partial<ScheduleLike> = {}): ScheduleLike => ({
  id: 's1', name: 'Weekly digest', artefact: 'weekly', cadence: 'every_update',
  recipients: ['a@x.test'], active: true, lastSentAt: '2026-09-13T06:28:00Z', ...over,
})

describe('artefacts', () => {
  it('names seven, and only seven', () => {
    expect(ARTEFACTS).toHaveLength(7)
    expect(isArtefact('brief:marketing')).toBe(true)
    expect(isArtefact('brief:ops')).toBe(false)
    expect(isArtefact(null)).toBe(false)
  })

  it('lists every artefact, including the ones nothing sends', () => {
    const rows = recipientRows([schedule()], 'weekly')
    expect(rows).toHaveLength(7)
    expect(rows[0].artefact).toBe('weekly')
    expect(rows[0].recipients).toEqual(['a@x.test'])
    expect(rows[0].sending).toBe(true)
    expect(rows.filter((r) => r.schedule === null)).toHaveLength(6)
    expect(rows[1].sending).toBe(false)
  })

  it('sends nothing on a paused workspace, whatever the schedule says', () => {
    const rows = recipientRows([schedule()], 'paused')
    expect(rows[0].schedule).not.toBeNull()
    expect(rows[0].sending).toBe(false)
    expect(sendingSummary(rows, 'paused')).toMatch(/paused/)
  })

  it('does not count an active schedule with no addresses as sending', () => {
    const rows = recipientRows([schedule({ recipients: [] })], 'weekly')
    expect(rows[0].sending).toBe(false)
    expect(sendingSummary(rows, 'weekly')).toBe('None of these has a recipient yet.')
  })

  it('names the older schedules that ARE still going out, instead of saying nothing is', () => {
    // Both live tenants carry a "Weekly digest" that predates the seven, is
    // active and has recipients — so "nothing is being sent" is true of the
    // seven and false of the workspace.
    const legacy = schedule({ artefact: null, recipients: ['a@x.test'] })
    const rows = recipientRows([legacy], 'weekly')
    expect(sendingSummary(rows, 'weekly', [legacy]))
      .toBe('None of these has a recipient yet. 1 older schedule is still going out, below.')
    // An older schedule with nobody on it is not "still going out".
    expect(sendingSummary(rows, 'weekly', [schedule({ artefact: null, recipients: [] })]))
      .toBe('None of these has a recipient yet.')
  })

  // A row for an artefact nothing builds is recorded and inert: it would have
  // to be resolved by its starter, which names a different artefact, so an
  // active row would email that one under this one's name and stamp
  // last_sent_at as if the right thing had gone out.
  it('does not call an artefact nothing builds "being sent", however its row is set', () => {
    // THE EXAMPLE USED TO BE `quarterly`, AND WP20 BUILT IT. A brief is the
    // unbuilt case now: WP19 builds all four in the Studio, but nothing in
    // lib/schedules/run.ts sends one, so a row pointed at the sales brief
    // would resolve through its starter to a different artefact.
    const rows = recipientRows([
      schedule({ id: 'a', artefact: 'weekly' }),
      schedule({ id: 'b', artefact: 'brief:sales' }),
    ], 'weekly')
    expect(rows[0].buildable).toBe(true)
    expect(rows[0].sending).toBe(true)
    expect(rows[3].artefact).toBe('brief:sales')
    expect(rows[3].buildable).toBe(false)
    expect(rows[3].sending).toBe(false)
    // "reports", not "artefacts": this module's docblock bans the dialect and
    // then reached for the one word in it that is in neither GLOSSARY nor the
    // thirteen.
    expect(sendingSummary(rows, 'weekly')).toBe('1 of 7 reports is being sent, to 1 address.')
    expect(isBuildable('weekly')).toBe(true)
    // `monthly` joined the buildable list in WP18 and `quarterly` in WP20,
    // each with a builder, a deck and a `sends*` branch in the runner behind
    // it. The four briefs are still not here: WP19 builds them, but nothing
    // sends one on a schedule.
    expect(ARTEFACTS.filter(isBuildable)).toEqual(['weekly', 'monthly', 'quarterly'])
    expect(notBuiltYet('brief:sales')).toContain('the sales brief')
    // ABOUT THE SCHEDULE, NOT ABOUT THE DOCUMENT. Össur has a built report
    // titled "Sales brief" and two Block B surfaces link to it in the same
    // week, so "we do not produce the sales brief yet" was false on screen.
    expect(notBuiltYet('brief:sales')).toBe(
      'Nothing sends the sales brief on a schedule yet. We will keep this list and start sending the day something does.',
    )
  })

  // WP18 is the monthly report's builder — sendsMonthly names the schedule,
  // snapshotMonthly builds it, renderMonthlyEmail is the body — and it shipped
  // without this entry, so Settings called the monthly reading "not yet", hid
  // the Active checkbox and switched off whatever an operator ticked. WP20 did
  // the same for the quarterly review, and the merge of the two is why this
  // test names three.
  it('calls the three artefacts that have a builder buildable, and no others', () => {
    expect(ARTEFACTS.filter(isBuildable)).toEqual(['weekly', 'monthly', 'quarterly'])
    const rows = recipientRows([
      schedule({ id: 'b', artefact: 'monthly', cadence: 'monthly' }),
      schedule({ id: 'q', artefact: 'quarterly', cadence: 'quarterly' }),
    ], 'monthly')
    expect(rows[1].buildable).toBe(true)
    expect(rows[1].sending).toBe(true)
    expect(rows[2].artefact).toBe('quarterly')
    expect(rows[2].buildable).toBe(true)
    expect(rows[2].sending).toBe(true)
  })

  it('counts addresses once across artefacts', () => {
    const rows = recipientRows([
      schedule({ id: 'a', artefact: 'weekly', recipients: ['a@x.test', 'b@x.test'] }),
    ], 'weekly')
    // The dedup itself, over two sending rows, without waiting for a second
    // builder to exist.
    const second = { ...rows[0], artefact: 'monthly' as const, recipients: ['B@x.test'], sending: true }
    expect(sendingSummary([rows[0], second], 'weekly')).toBe('2 of 2 reports are being sent, to 2 addresses.')
  })

  it('keeps a schedule that names no artefact rather than dropping it', () => {
    const legacy = schedule({ artefact: null })
    expect(recipientRows([legacy], 'weekly').every((r) => r.schedule === null)).toBe(true)
    expect(unnamedSchedules([legacy, schedule()])).toEqual([legacy])
  })
})

// ---- the change log ---------------------------------------------------------

const change = (over: Partial<ConfigChange> = {}): ConfigChange => ({
  id: 'c1', client_id: 't1', changed_at: '2026-09-13T10:00:00Z', surface: 'terms',
  field: 'brand_keywords', before: ['ossur'], after: ['ossur', 'amputee'],
  actor_kind: 'user', actor_user_id: 'u1', actor_label: 'a@x.test · operator view · settings',
  run_id: null, source: 'logged', rows_affected: null, note: 'added a term for your brand',
  affects_audiences: null, affects_months: null, ...over,
})

describe('what a table hides', () => {
  // The card names everything else it hides — the communities remainder, the
  // prehistory count — and the change log's own truncation said nothing.
  it('says how many of the log it is showing, and only when it is hiding some', () => {
    expect(showingLine(CHANGE_LOG_ROWS, 33)).toBe('Showing the 20 most recent of 33.')
    expect(showingLine(CHANGE_LOG_ROWS, 20)).toBeNull()
    expect(showingLine(CHANGE_LOG_ROWS, 1)).toBeNull()
    expect(showingLine(20, 1_200)).toBe('Showing the 20 most recent of 1,200.')
  })
})

describe('actorWords', () => {
  it('says "You" only to the person who did it', () => {
    expect(actorWords('user', { actorUserId: 'u1', viewerUserId: 'u1' })).toBe('You')
    expect(actorWords('user', { actorUserId: 'u1', viewerUserId: 'u2', actorEmail: 'a@x.test' })).toBe('a@x.test')
    expect(actorWords('user', { actorUserId: 'u1', viewerUserId: 'u2' })).toBe('Someone on your team')
  })

  it('collapses our three hands into one word', () => {
    expect(actorWords('operator')).toBe('Verbatim')
    expect(actorWords('script')).toBe('Verbatim')
    expect(actorWords('sql')).toBe('Verbatim')
  })

  it('keeps the pipeline and the reconstruction apart from us and from each other', () => {
    expect(actorWords('pipeline')).toBe('An automatic update')
    expect(actorWords('reconstructed')).toBe('Reconstructed, not recorded')
  })
})

describe('monthsOfRange', () => {
  it('reads the exclusive end back as a month a reader can see', () => {
    expect(monthsOfRange('[2021-12-01,2026-10-01)')).toEqual({ from: '2021-12', to: '2026-09' })
    expect(monthsOfRange('[2026-01-01,2026-02-01)')).toEqual({ from: '2026-01', to: '2026-01' })
  })

  it('crosses a year boundary', () => {
    expect(monthsOfRange('[2025-11-01,2026-01-01)')).toEqual({ from: '2025-11', to: '2025-12' })
  })

  it('is null on anything it cannot read, so "not known" never becomes a month', () => {
    expect(monthsOfRange(null)).toBeNull()
    expect(monthsOfRange('empty')).toBeNull()
    expect(monthsOfRange('')).toBeNull()
  })
})

describe('breakClause', () => {
  it('tells "not known" from "nothing", and says which', () => {
    expect(breakClause({ affects_audiences: null, affects_months: null, source: 'logged' })).toBe('Not recorded.')
    expect(breakClause({ affects_audiences: null, affects_months: null, source: 'reconstructed' }))
      .toMatch(/worked out afterwards/)
  })

  it('names the audiences and the months it moved', () => {
    expect(breakClause({
      affects_audiences: ['competitor:Freitag', 'competitor:FREITAG'],
      affects_months: '[2026-06-01,2026-09-01)',
      source: 'logged',
    // In the reader's words: `audienceLabel` for the audience and `monthName`
    // for the months, as every other surface prints them.
    })).toBe('2 audiences · Jun 2026 to Aug 2026')
    expect(breakClause({ affects_audiences: ['client'], affects_months: null, source: 'logged' })).toBe('Your own brand')
    expect(breakClause({ affects_audiences: ['competitor:Ottobock'], affects_months: '[2026-09-01,2026-10-01)', source: 'logged' }))
      .toBe('Ottobock · Sep 2026')
  })
})

describe('renderSide', () => {
  it('renders a list as its items, not as JSON', () => {
    expect(renderSide('terms', ['ossur', 'amputee'])).toBe('ossur, amputee')
    expect(renderSide('terms', [])).toBe('nothing')
  })

  it('caps a long list instead of printing a corpus', () => {
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`)
    expect(renderSide('terms', many)).toBe('t0, t1, t2, t3, t4, t5, t6, t7 and 4 more')
  })

  it('never dumps a jsonb blob', () => {
    expect(renderSide('handles', { instagram: 'x', tiktok: 'y' })).toBe('instagram, tiktok')
    expect(renderSide('knobs', { max_videos: 30, comment_depth: 2 })).toBe('2 settings')
    expect(renderSide('subreddits', [{ name: 'amputee', probe: { at: 'x' } }])).toBe('amputee')
  })

  it('is null on null, so a one-sided change says so', () => {
    expect(renderSide('terms', null)).toBeNull()
    expect(renderSide('terms', undefined)).toBeNull()
  })
})

describe('readChangeLog', () => {
  it('keeps the record and the prehistory apart and never sums them', () => {
    const view = readChangeLog({
      rows: [
        change({ id: 'a', changed_at: '2026-09-13T10:00:00Z' }),
        change({ id: 'b', changed_at: '2026-07-01T10:00:00Z', source: 'reconstructed', actor_kind: 'reconstructed' }),
        change({ id: 'c', changed_at: '2026-08-18T10:00:00Z' }),
      ],
    })
    expect(view.recorded.map((r) => r.id)).toEqual(['a', 'c'])
    expect(view.prehistory.map((r) => r.id)).toEqual(['b'])
    expect(view.firstLoggedAt).toBe('2026-08-18T10:00:00Z')
  })

  it('carries no actor_label field at all', () => {
    const [row] = readChangeLog({ rows: [change()] }).recorded
    expect(JSON.stringify(row)).not.toContain('operator view')
    expect('actorLabel' in row).toBe(false)
    expect(row.who).toBe('Someone on your team')
  })

  it('composes a sentence for a trigger row that carries no note', () => {
    const [row] = readChangeLog({ rows: [change({ note: null, surface: 'cadence', field: 'report_day' })] }).recorded
    expect(row.said).toBe('Cadence (report_day) changed.')
  })

  it('resolves a teammate to an address, and the viewer to "You"', () => {
    const rows = [change({ id: 'a', actor_user_id: 'u1' }), change({ id: 'b', actor_user_id: 'u2' })]
    const view = readChangeLog({ rows, viewerUserId: 'u1', emails: { u2: 'b@x.test' } })
    expect(view.recorded.map((r) => r.who)).toEqual(['You', 'b@x.test'])
  })

  it('is null-firstLoggedAt while only prehistory exists', () => {
    const view = readChangeLog({ rows: [change({ source: 'reconstructed' })] })
    expect(view.firstLoggedAt).toBeNull()
    expect(view.recorded).toEqual([])
    expect(view.prehistory[0].reconstructed).toBe(true)
  })
})

// ---- the reject log ---------------------------------------------------------

const verdict = (over: Partial<GateVerdict> = {}): GateVerdict => ({
  platform: 'tiktok', keyword: 'sealand gear', kept: false, source: 'gpt',
  createdAt: '2026-09-09T00:00:00Z', ...over,
})

describe('the reject log', () => {
  const rows: GateVerdict[] = [
    verdict({ keyword: 'sealand gear', kept: false }),
    verdict({ keyword: 'sealand gear', kept: true }),
    verdict({ keyword: 'upcycled bag', kept: true, platform: 'youtube' }),
    verdict({ keyword: 'upcycled bag', kept: true, platform: 'youtube', source: 'default' }),
    verdict({ keyword: null, kept: false, platform: 'reddit', accountName: 'r/Backpacks' }),
    verdict({ keyword: 'x', kept: true, platform: 'reddit', accountName: 'backpacks' }),
  ]

  it('computes a kept-rate per term, most-looked-at first', () => {
    const byTerm = keptByTerm(rows)
    expect(byTerm.map((r) => [r.label, r.found, r.kept, r.keptPct])).toEqual([
      ['sealand gear', 2, 1, 50],
      ['upcycled bag', 2, 2, 100],
      ['x', 1, 1, 100],
    ])
  })

  it('folds a community the one way, so r/Backpacks and backpacks are one row', () => {
    const byCommunity = keptByCommunity(rows)
    expect(byCommunity).toHaveLength(1)
    expect(byCommunity[0]).toMatchObject({ label: 'r/backpacks', found: 2, kept: 1, keptPct: 50 })
  })

  it('counts the rows nobody judged separately from the rows that were kept', () => {
    const byPlatform = keptByPlatform(rows)
    const youtube = byPlatform.find((r) => r.key === 'youtube')!
    expect(youtube).toMatchObject({ found: 2, kept: 2, unjudged: 1 })
  })

  it('states the date the record begins, every time', () => {
    const totals = gateTotals(rows)
    expect(totals).toMatchObject({ found: 6, kept: 4, dropped: 2, unjudged: 1, firstAt: '2026-09-09T00:00:00Z' })
    expect(gateSummary(totals, '2026-06-28T00:00:00Z'))
      .toBe('2 of 6 candidates were set aside (33.3%) · recorded from 9 Sep 2026 · so updates before that date show no share at all.')
  })

  it('does not claim a gap that is not there', () => {
    const totals = gateTotals(rows)
    expect(gateSummary(totals, '2026-09-09T00:00:00Z')).not.toMatch(/show no share/)
    expect(gateSummary(gateTotals([]), null)).toBe('Nothing has been judged for this workspace yet.')
  })

  // The page's totals come off head counts now: the rows are unbounded and the
  // three numbers it prints are countable without them.
  it('totals the same from counts as from rows, and says what a rate is over', () => {
    expect(gateTotalsFrom({ found: 6, kept: 4, unjudged: 1, firstAt: '2026-09-09T00:00:00Z' }))
      .toEqual(gateTotals(rows))
    expect(sampleNote(GATE_SAMPLE, 2_777))
      .toBe('Rates are over the 1,000 most recent judgements, of 2,777 recorded.')
    // The sample IS the record: a basis line nobody needs is noise.
    expect(sampleNote(6, 6)).toBeNull()
    expect(sampleNote(0, 0)).toBeNull()
  })

  it('keys an appeal the way the verdict is keyed', () => {
    expect(appealKey({ runId: 'r1', platform: 'tiktok', videoId: 'v1' })).toBe('r1|tiktok|v1')
    expect(appealKey({ runId: null, platform: 'tiktok', videoId: 'v1' })).toBe('none|tiktok|v1')
    expect(REJECT_ROWS).toBe(20)
  })
})

// ---- the delivery record ----------------------------------------------------

const update = (startedAt: string, status = 'completed'): UpdateInput =>
  ({ id: startedAt, status, startedAt, completedAt: null, scheduledFor: null, stalled: null })

describe('deliveryRecord', () => {
  const updates = [
    update('2026-09-13T06:00:00Z'),
    update('2026-09-06T06:00:00Z'),
    update('2026-08-30T06:00:00Z', 'failed'),
    update('2026-06-28T06:00:00Z', 'partial'),
  ]

  it('counts every update that happened, failures included', () => {
    const rec = deliveryRecord({ updates, slotsRecorded: false })
    expect(rec.total).toBe(4)
    expect(rec.since).toBe('2026-06-28')
    expect(rec.lastOn).toBe('2026-09-13')
    // The failed run of 30 August is IN the count and is not "finished" —
    // and the longest gap is measured between the updates that produced
    // something, so it runs 28 June → 6 September, straight past it.
    expect(rec.recentSettled).toBe(3)
    expect(rec.line).toBe('4 updates since 28 Jun 2026 · longest gap 70 days · last on 13 Sep 2026')
  })

  it('says the slot is unrecorded rather than printing a ratio it cannot compute', () => {
    const rec = deliveryRecord({ updates, slotsRecorded: false })
    expect(rec.scheduledServed).toBeNull()
    expect(rec.caveats[0]).toMatch(/not recorded yet/)
  })

  it('splits scheduled from by-hand once the column lands, and still names what it cannot see', () => {
    const withSlots = [
      { ...update('2026-09-13T06:00:00Z'), scheduledFor: '2026-09-13T06:00:00Z' },
      update('2026-09-10T06:00:00Z'),
    ]
    const rec = deliveryRecord({ updates: withSlots, slotsRecorded: true })
    expect(rec.scheduledServed).toEqual({ scheduled: 1, byHand: 1 })
    expect(rec.caveats[0]).toMatch(/leaves no trace/)
  })

  it('says so plainly on a workspace with no update at all', () => {
    const rec = deliveryRecord({ updates: [], slotsRecorded: false })
    expect(rec.line).toBe('No update has run for this workspace yet.')
    expect(rec.longestGapDays).toBeNull()
  })

  it('picks a month out by the update it ran on, newest first', () => {
    expect(updatesInMonth(updates, '2026-09').map((u) => u.startedAt.slice(0, 10)))
      .toEqual(['2026-09-13', '2026-09-06'])
    expect(updatesInMonth(updates, '2026-07')).toEqual([])
  })
})

// ---- readiness, client view -------------------------------------------------

const readyRow = (over: Partial<ReadinessRow> = {}): ReadinessRow => ({
  id: 'r', block: 'B', input: 'i', status: 'partial', detail: 'd', owner: 'ops',
  unlocks: 'Apply the change log.', notes: [], ...over,
})

describe('clientReadiness', () => {
  const rows: ReadinessRow[] = [
    readyRow({ id: 'rival-accounts', owner: 'client', status: 'missing', unlocks: 'Add their accounts here.' }),
    readyRow({ id: 'tracked-terms', owner: 'ops', status: 'partial' }),
    readyRow({ id: 'subject-set', owner: 'engineering', status: 'missing' }),
    readyRow({ id: 'months-of-history', owner: 'ops', status: 'missing' }),
    readyRow({ id: 'read-depth', owner: 'engineering', status: 'partial' }),
    readyRow({ id: 'retention', owner: 'ops', status: 'exists' }),
  ]

  it('withholds a missing row we own, and keeps a missing row the client owns', () => {
    const view = clientReadiness(rows)
    expect(view.rows.map((r) => r.id)).toEqual([
      'rival-accounts', 'tracked-terms', 'read-depth', 'retention',
    ])
    expect(view.withheld).toBe(2)
  })

  it('shows a formerly-withheld row the moment it has something to measure', () => {
    const seeded = rows.map((r) => (r.id === 'months-of-history' ? { ...r, status: 'partial' as const } : r))
    expect(clientReadiness(seeded).rows.map((r) => r.id)).toContain('months-of-history')
  })

  it('summarises over the rows shown, not over all thirteen', () => {
    const view = clientReadiness(rows)
    expect(view.summary.missing).toBe(1)
    expect(view.summary.exists).toBe(1)
    expect(view.summary.partial).toBe(2)
  })

  it('replaces our dialect and leaves the client’s own sentence alone', () => {
    const view = clientReadiness(rows)
    expect(view.rows.find((r) => r.id === 'rival-accounts')!.unlocks).toBe('Add their accounts here.')
    expect(view.rows.find((r) => r.id === 'tracked-terms')!.unlocks).not.toMatch(/Apply/)
    expect(view.rows.find((r) => r.id === 'tracked-terms')!.ownerWords).toBe('We do this')
    expect(view.rows.find((r) => r.id === 'rival-accounts')!.ownerWords).toBe('Yours to change')
  })

  it('prints a "by when" only where a date was supplied', () => {
    const view = clientReadiness(rows, { by: { retention: '2026-09-17' } })
    expect(view.rows.find((r) => r.id === 'retention')!.by).toBe('17 Sep 2026')
    expect(view.rows.find((r) => r.id === 'tracked-terms')!.by).toBeNull()
  })

  it('says how many rows are held back, or nothing at all', () => {
    expect(withheldLine(2)).toMatch(/2 further inputs are not shown/)
    expect(withheldLine(1)).toMatch(/1 further input is not shown/)
    expect(withheldLine(0)).toBeNull()
  })
})

// ---- when a term was added --------------------------------------------------

describe('termDates', () => {
  const log: ConfigChange[] = [
    change({ id: '1', changed_at: '2026-07-03T09:00:00Z', source: 'reconstructed', before: null, after: ['ossur', 'amputee'] }),
    change({ id: '2', changed_at: '2026-08-18T09:00:00Z', before: ['ossur', 'amputee'], after: ['ossur', 'amputee', 'prosthetic leg'] }),
    change({ id: '3', changed_at: '2026-09-13T09:00:00Z', before: ['ossur'], after: ['ossur', 'Amputee'] }),
  ]

  it('dates a term by the change that first named it', () => {
    const dates = termDates(log)
    expect(dates.get('prosthetic leg')).toEqual({ on: '2026-08-18', source: 'recorded' })
  })

  it('prefers a record to a reconstruction, even a later one', () => {
    expect(termDates(log).get('amputee')).toEqual({ on: '2026-09-13', source: 'recorded' })
  })

  it('keeps a reconstruction where that is all there is, and words it as a bound', () => {
    const only = termDates([log[0]])
    expect(only.get('ossur')).toEqual({ on: '2026-07-03', source: 'reconstructed' })
    expect(termDateWords(only.get('ossur'))).toBe('in use by 2026-07-03, not recorded')
  })

  it('says "before we kept a record" for a term the log never names', () => {
    expect(termDateWords(termDates(log).get('never-typed'))).toBe('in the set before we kept a record')
  })

  it('ignores a change to something that is not a term', () => {
    const other = termDates([change({ surface: 'rivals', field: 'competitor_names', after: ['Ottobock'] })])
    expect(other.size).toBe(0)
  })
})
