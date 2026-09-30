import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { articleFor, canResendInvite, inviteState, memberUpdateStatus, scheduleLine, UPDATE_STATUS_WORDS, withArticle } from './team-copy'

describe('team copy', () => {
  it('puts the right article before a role', () => {
    expect(withArticle('admin')).toBe('an admin')
    expect(withArticle('owner')).toBe('an owner')
    expect(withArticle('member')).toBe('a member')
    expect(articleFor('admin')).toBe('an')
  })

  it('reads an invite past its date as expired, in the app’s date form', () => {
    const now = '2026-09-29T10:00:00.000Z'
    expect(inviteState('2026-09-24T09:00:00.000Z', now)).toEqual({ expired: true, line: 'expired 24 Sep 2026' })
    expect(inviteState('2026-10-06T09:00:00.000Z', now)).toEqual({ expired: false, line: 'expires 6 Oct 2026' })
    expect(inviteState('2026-09-24T09:00:00.000Z', now).line).not.toMatch(/\//)
  })

  it('lets an inviter resend only what they could have sent', () => {
    expect(canResendInvite('owner', 'admin')).toBe(true)
    expect(canResendInvite('owner', 'member')).toBe(true)
    expect(canResendInvite('admin', 'member')).toBe(true)
    expect(canResendInvite('admin', 'admin')).toBe(false)
    expect(canResendInvite('member', 'member')).toBe(false)
  })
})

describe('who gets the update (sw-2 item 2)', () => {
  // Sealand, 30 Sep: the digest is paused with Brayden and Daniela on it. The
  // page said "Who gets the update (0)" and "not on the update" beside both.
  const schedules = [{ name: 'Weekly digest', active: false, recipients: ['brayden@sealandgear.com', 'Daniela@sealandgear.com'] }]

  it('puts a member on a paused list on it, and says it is paused', () => {
    expect(memberUpdateStatus('brayden@sealandgear.com', schedules)).toBe('paused')
    expect(memberUpdateStatus('daniela@sealandgear.com', schedules)).toBe('paused')
    expect(memberUpdateStatus('sealand@verbatimintel.com', schedules)).toBe('none')
    expect(memberUpdateStatus('brayden@sealandgear.com', [...schedules, { name: 'Monthly', active: true, recipients: ['brayden@sealandgear.com'] }])).toBe('gets')
    expect(UPDATE_STATUS_WORDS.paused).toBe('on the update, which is paused')
  })

  it('lists a paused schedule’s addresses and says nothing is sent', () => {
    expect(scheduleLine(schedules[0])).toBe('paused, so nothing is sent · 2 addresses on it: brayden@sealandgear.com · Daniela@sealandgear.com')
    expect(scheduleLine({ name: 'x', active: false, recipients: [] })).toBe('paused, with no addresses on it')
    expect(scheduleLine({ name: 'x', active: true, recipients: [] })).toBe('no addresses yet')
    expect(scheduleLine({ name: 'x', active: true, recipients: ['a@b.c'] })).toBe('a@b.c')
  })

  it('no longer counts only the switched-on schedules in its title', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/team/page.tsx'), 'utf8')
    expect(page).not.toContain('activeRecipientSet')
    expect(page).toContain('Who gets the update</CardTitle>')
  })
})
