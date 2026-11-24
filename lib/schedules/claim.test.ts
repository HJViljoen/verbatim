import { describe, expect, it } from 'vitest'
import { claimDecision, claimRetryAt, holdsBeforeEmail, pruneInlineImages, runnerClaimDecision, weeklyReadPath } from './claim'
import { SCHEDULE_CLAIM_STALE_MS } from '../config'

const now = Date.parse('2026-09-06T04:10:00Z')
const at = (msAgo: number) => new Date(now - msAgo).toISOString()

describe('claimDecision — one email per schedule per update', () => {
  it('a sent row is never sent again', () => {
    expect(claimDecision({ id: 'a', status: 'sent', claimed_at: at(60_000) }, now)).toBe('already_sent')
  })
  it('a young claim belongs to whoever is on it', () => {
    expect(claimDecision({ id: 'a', status: 'claimed', claimed_at: at(SCHEDULE_CLAIM_STALE_MS - 1000) }, now)).toBe('skipped')
  })
  it('a build waiting for review is never taken over, however old', () => {
    // Taking it over would discard a reviewed brief and its edits, and pay to
    // write another one.
    expect(claimDecision({ id: 'a', status: 'ready', claimed_at: at(SCHEDULE_CLAIM_STALE_MS * 10) }, now)).toBe('waiting')
  })
  it('a stale claim, a failure or a skip is taken over', () => {
    expect(claimDecision({ id: 'a', status: 'claimed', claimed_at: at(SCHEDULE_CLAIM_STALE_MS + 1000) }, now)).toBe('takeover')
    expect(claimDecision({ id: 'a', status: 'failed', claimed_at: at(1000) }, now)).toBe('takeover')
    expect(claimDecision({ id: 'a', status: 'skipped', claimed_at: at(1000) }, now)).toBe('takeover')
  })
})

describe('runnerClaimDecision: a claim left by an attempt that died (22 Nov, Sealand)', () => {
  const young = at(5 * 60_000 + 41_000)
  const stale = at(SCHEDULE_CLAIM_STALE_MS + 1000)
  it('on a schedule that holds before it emails, a young claim that never stood ready is in progress, not skipped', () => {
    expect(runnerClaimDecision({ id: 'a', status: 'claimed', claimed_at: young, ready_at: null }, true, now)).toBe('in_progress')
    expect(runnerClaimDecision({ id: 'a', status: 'claimed', claimed_at: young }, true, now)).toBe('in_progress')
  })
  it('once stale, the same claim is taken over', () => {
    expect(runnerClaimDecision({ id: 'a', status: 'claimed', claimed_at: stale, ready_at: null }, true, now)).toBe('takeover')
  })
  it('a claim on a row that stood ready is a delivery: never rebuilt, young or stale', () => {
    // It may have emailed the list before it died; the Studio offers its Send.
    expect(runnerClaimDecision({ id: 'a', status: 'claimed', claimed_at: young, ready_at: at(6 * 60_000) }, true, now)).toBe('skipped')
    expect(runnerClaimDecision({ id: 'a', status: 'claimed', claimed_at: stale, ready_at: at(SCHEDULE_CLAIM_STALE_MS * 2) }, true, now)).toBe('skipped')
  })
  it('every other schedule (a document build, a digest) answers exactly as claimDecision does', () => {
    for (const row of [
      { id: 'a', status: 'claimed', claimed_at: young, ready_at: null },
      { id: 'a', status: 'claimed', claimed_at: stale, ready_at: null },
      { id: 'a', status: 'claimed', claimed_at: stale, ready_at: at(SCHEDULE_CLAIM_STALE_MS * 2) },
      { id: 'a', status: 'ready', claimed_at: young, ready_at: young },
      { id: 'a', status: 'sent', claimed_at: young, ready_at: null },
      { id: 'a', status: 'failed', claimed_at: young, ready_at: null },
    ]) expect(runnerClaimDecision(row, false, now)).toBe(claimDecision(row, now))
  })
  it('sent, ready, failed and skipped rows answer as before on every schedule', () => {
    expect(runnerClaimDecision({ id: 'a', status: 'sent', claimed_at: young }, true, now)).toBe('already_sent')
    expect(runnerClaimDecision({ id: 'a', status: 'ready', claimed_at: young, ready_at: young }, true, now)).toBe('waiting')
    expect(runnerClaimDecision({ id: 'a', status: 'failed', claimed_at: young }, true, now)).toBe('takeover')
    expect(runnerClaimDecision({ id: 'a', status: 'skipped', claimed_at: young }, true, now)).toBe('takeover')
  })
})

describe('holdsBeforeEmail: where coming back for a dead claim can email nobody twice', () => {
  const base = { review: false, starter_key: null as string | null, artefact: null as string | null }
  it('every weekly read, review on or off', () => {
    expect(holdsBeforeEmail({ ...base, starter_key: 'weekly_read', artefact: 'weekly_read', review: false })).toBe(true)
    expect(holdsBeforeEmail({ ...base, starter_key: 'weekly_read', artefact: 'weekly_read', review: true })).toBe(true)
  })
  it('a block artefact under review only', () => {
    expect(holdsBeforeEmail({ ...base, starter_key: 'monthly_report', artefact: 'monthly', review: true })).toBe(true)
    expect(holdsBeforeEmail({ ...base, starter_key: 'monthly_report', artefact: 'monthly', review: false })).toBe(false)
  })
  it('never a report schedule (a document build or a digest) or a brief, review or not', () => {
    expect(holdsBeforeEmail({ ...base, review: true })).toBe(false)
    expect(holdsBeforeEmail({ ...base, review: true, artefact: 'brief:leadership' })).toBe(false)
    expect(holdsBeforeEmail({ ...base, starter_key: 'sales_brief', review: true })).toBe(false)
  })
})

describe('claimRetryAt', () => {
  it('is the moment claimDecision calls the claim stale, and a minute more', () => {
    const claimedAt = '2026-11-22T07:57:45.000Z'
    const retry = Date.parse(claimRetryAt(claimedAt))
    expect(retry - Date.parse(claimedAt)).toBe(SCHEDULE_CLAIM_STALE_MS + 60_000)
    expect(claimDecision({ id: 'a', status: 'claimed', claimed_at: claimedAt }, retry)).toBe('takeover')
    expect(claimDecision({ id: 'a', status: 'claimed', claimed_at: claimedAt }, retry - 60_001)).toBe('skipped')
  })
})

describe('pruneInlineImages', () => {
  const png = (cid: string) => ({ filename: `${cid}.png`, content: Buffer.alloc(1), contentType: 'image/png', contentId: cid })
  it('drops a picture the email never referenced, keeps the ones it did and any plain attachment', () => {
    const html = '<img src="cid:dashboard-movement@verbatim">'
    const out = pruneInlineImages(html, [png('dashboard-movement@verbatim'), png('dashboard-accounts@verbatim'), { filename: 'update.pdf', content: Buffer.alloc(1) }])
    expect(out.map((a) => a.filename)).toEqual(['dashboard-movement@verbatim.png', 'update.pdf'])
  })
})

describe('weeklyReadPath: who a weekly read emails (5 Oct: every path but send puts it in the past issues)', () => {
  const list = ['a@client.test', 'b@client.test']
  it('a list and an update allowed to email: the list without review, the reviewer with it', () => {
    expect(weeklyReadPath({ review: false, recipients: list })).toBe('send')
    expect(weeklyReadPath({ review: true, recipients: list })).toBe('review')
  })
  it('nobody on the list: hold, review or not (there is nothing for Send to do)', () => {
    expect(weeklyReadPath({ review: true, recipients: [] })).toBe('hold')
    expect(weeklyReadPath({ review: false, recipients: [] })).toBe('hold')
  })
  it('an update that may email nobody (a manual run, a schedule not due): hold, whatever the list and the review flag', () => {
    expect(weeklyReadPath({ review: false, recipients: list }, true)).toBe('hold')
    expect(weeklyReadPath({ review: true, recipients: list }, true)).toBe('hold')
  })
})
