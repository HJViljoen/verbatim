import { describe, it, expect } from 'vitest'
import { renderInviteEmail } from './email'

// The invite email's copy and addressing. Pure: `renderInviteEmail` reads only
// its argument plus the module-level EMAIL_FROM, and no Resend client is
// constructed without an API key — so this stays inside the repo's
// pure-logic-only test rule.
//
// What is actually being protected here: an invite is the first thing a
// stranger sees from Verbatim, and for a year it opened with a raw Gmail
// address and offered no way to answer. Name in the body, address in the
// Reply-To.

const base = {
  to: 'daniela@sealandgear.com',
  inviteUrl: 'https://app.verbatimintel.com/invite/tok123',
  companyName: 'Sealand',
}

describe('renderInviteEmail — who the invite says it is from', () => {
  it('names the person when a full name is known', () => {
    const { text, html } = renderInviteEmail({
      ...base,
      invitedByName: 'Heinrich Viljoen',
      invitedByEmail: 'heinrichviljoen@verbatimintel.com',
    })
    expect(text).toContain('Heinrich Viljoen invited you to join the Sealand workspace on Verbatim.')
    expect(html).toContain('Heinrich Viljoen invited you to join')
    // The address belongs in the Reply-To, not in the sentence.
    expect(text).not.toContain('heinrichviljoen@verbatimintel.com invited you')
  })

  it('falls back to the address when there is no name', () => {
    const { text } = renderInviteEmail({ ...base, invitedByEmail: 'sealand@verbatimintel.com' })
    expect(text).toContain('sealand@verbatimintel.com invited you to join the Sealand workspace on Verbatim.')
  })

  it('treats a blank or whitespace name as no name', () => {
    const { text } = renderInviteEmail({
      ...base,
      invitedByName: '   ',
      invitedByEmail: 'sealand@verbatimintel.com',
    })
    expect(text).toContain('sealand@verbatimintel.com invited you to join')
  })

  it('keeps the existing wording when neither is known', () => {
    const { text, html } = renderInviteEmail(base)
    expect(text).toContain('invited you to join the Sealand workspace on Verbatim.')
    expect(text).not.toContain('undefined')
    expect(html).not.toContain('undefined')
  })

  it('says "a workspace" when the company name is missing', () => {
    const { subject, text } = renderInviteEmail({ ...base, companyName: '', invitedByName: 'Heinrich Viljoen' })
    expect(subject).toBe("You're invited to a Verbatim workspace")
    expect(text).toContain('Heinrich Viljoen invited you to join a workspace on Verbatim.')
  })
})

describe('renderInviteEmail — Reply-To', () => {
  it('carries the inviter address when known', () => {
    const r = renderInviteEmail({ ...base, invitedByName: 'Heinrich Viljoen', invitedByEmail: 'heinrichviljoen@verbatimintel.com' })
    expect(r.replyTo).toBe('heinrichviljoen@verbatimintel.com')
  })

  it('carries it even when there is no name to show', () => {
    expect(renderInviteEmail({ ...base, invitedByEmail: 'sealand@verbatimintel.com' }).replyTo)
      .toBe('sealand@verbatimintel.com')
  })

  it('is ABSENT, not undefined-valued, when the address is unknown', () => {
    const r = renderInviteEmail({ ...base, invitedByName: 'Heinrich Viljoen' })
    expect(r.replyTo).toBeUndefined()
    expect('replyTo' in r).toBe(false)
  })

  it('is absent for a blank address rather than an empty Reply-To header', () => {
    expect('replyTo' in renderInviteEmail({ ...base, invitedByEmail: '  ' })).toBe(false)
  })
})

describe('renderInviteEmail — the HTML body', () => {
  it('escapes a name that contains markup', () => {
    const { html } = renderInviteEmail({ ...base, invitedByName: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('escapes the ampersands and quotes a real name can carry', () => {
    const { html } = renderInviteEmail({ ...base, invitedByName: 'Ben & "Jerry" Smit' })
    expect(html).toContain('Ben &amp; &quot;Jerry&quot; Smit')
  })

  it('escapes the workspace name too', () => {
    const { html } = renderInviteEmail({ ...base, companyName: 'Tom & Co <b>' })
    expect(html).toContain('Tom &amp; Co &lt;b&gt;')
  })
})

describe('renderInviteEmail — the invariants the copy rests on', () => {
  const r = renderInviteEmail({
    ...base,
    invitedByName: 'Heinrich Viljoen',
    invitedByEmail: 'heinrichviljoen@verbatimintel.com',
  })

  it('subject names the workspace', () => {
    expect(r.subject).toBe("You're invited to Sealand on Verbatim")
  })

  it('both bodies carry the accept URL', () => {
    expect(r.text).toContain(base.inviteUrl)
    expect(r.html).toContain(base.inviteUrl)
  })

  it('states the 7-day expiry, which is the invitations column default', () => {
    expect(r.text).toContain('This link expires in 7 days.')
    expect(r.html).toContain('This link expires in 7 days.')
  })

  // DESIGN.md: "No em-dashes." in client-facing copy.
  it('uses no em-dashes or en-dashes', () => {
    expect(r.text).not.toMatch(/[—–]/)
    expect(r.html).not.toMatch(/[—–]/)
  })
})
