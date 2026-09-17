import { describe, it, expect } from 'vitest'
import { canSeeStudio, STUDIO_HREF, STUDIO_TENANT_VISIBLE } from './studio-visibility'
import type { OperatorView } from './auth'

// The gate that hides the Studio from tenant users (owner's call 2026-09-17).
// Both answers stay tested while the flag is off: the call sites read the
// constant, these tests pass it explicitly.

const tenant = { operator: null }
const operatorHome: { operator: OperatorView } = {
  operator: { homeClientId: 'c1', viewingClientId: 'c1', viewingName: 'Össur', isHome: true },
}
const operatorViewingTenant: { operator: OperatorView } = {
  operator: { homeClientId: 'c1', viewingClientId: 'c2', viewingName: 'Sealand', isHome: false },
}

describe('canSeeStudio', () => {
  it('hides the Studio from a tenant user while the flag is off', () => {
    expect(canSeeStudio(tenant, false)).toBe(false)
  })

  it('shows it to a platform operator on their own workspace', () => {
    expect(canSeeStudio(operatorHome, false)).toBe(true)
  })

  it('shows it to an operator viewing a tenant through the workspace switcher', () => {
    expect(canSeeStudio(operatorViewingTenant, false)).toBe(true)
  })

  it('shows it to everyone once the flag is flipped back on', () => {
    expect(canSeeStudio(tenant, true)).toBe(true)
    expect(canSeeStudio(operatorHome, true)).toBe(true)
  })

  it('reads the shipped constant when no flag is passed', () => {
    expect(canSeeStudio(tenant)).toBe(STUDIO_TENANT_VISIBLE)
    expect(canSeeStudio(operatorHome)).toBe(true)
  })

  it('is off for tenants as shipped', () => {
    // The guard on the whole point of the change: if this ever goes true by
    // accident, every client sees the Studio again.
    expect(STUDIO_TENANT_VISIBLE).toBe(false)
  })

  it('names one route, the one every surface links to', () => {
    expect(STUDIO_HREF).toBe('/dashboard/studio')
  })
})
