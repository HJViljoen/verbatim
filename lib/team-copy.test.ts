import { describe, expect, it } from 'vitest'
import { articleFor, canResendInvite, inviteState, withArticle } from './team-copy'

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
