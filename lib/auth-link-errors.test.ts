import { describe, it, expect } from 'vitest'
import { linkNotice, codelessCallbackTarget } from './auth-link-errors'

describe('linkNotice', () => {
  it('says nothing when the page arrived without an error', () => {
    expect(linkNotice('login', undefined)).toBeNull()
    expect(linkNotice('reset', '')).toBeNull()
  })

  it('tells the reset page its link expired, whatever the code', () => {
    expect(linkNotice('reset', 'link_expired')).toMatch(/expired or was used already/)
    expect(linkNotice('reset', ['something_else'])).toMatch(/send you a new one/)
  })

  it('tells sign in the link did not work and points at the way in', () => {
    const text = linkNotice('login', 'link_invalid')
    expect(text).toMatch(/didn’t work/)
    expect(text).toMatch(/reset your password/)
  })

  it('never uses an em dash', () => {
    for (const page of ['login', 'reset'] as const) expect(linkNotice(page, 'x')).not.toContain('—')
  })
})

describe('codelessCallbackTarget', () => {
  it('sends an expired reset link back to the reset form', () => {
    const p = new URLSearchParams('error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    expect(codelessCallbackTarget(p, '/reset/confirm')).toBe('/reset?error=link_expired')
  })

  it('sends a link that is simply missing its code to sign in', () => {
    expect(codelessCallbackTarget(new URLSearchParams(''), '/reset/confirm')).toBe('/login?error=link_invalid')
    expect(codelessCallbackTarget(new URLSearchParams('error=x'), '/dashboard')).toBe('/login?error=link_invalid')
  })
})
