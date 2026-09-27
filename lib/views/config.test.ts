import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { VIEWS, viewsConfigFor, viewsLive } from './config'

// The views' switch (plan WP3.3, decision F). PINNED OFF: it turns true only
// on Heinrich's word after WP3.2's check (maker and off-topic precision both
// at least 0.8 on a fresh 50 plus his 20, checked by Fri 13 Nov), in a commit
// of its own that changes this test with it.

describe('VIEWS', () => {
  it('is Sealand only, with Buyers and Makers off and off-topic videos left in the default count', () => {
    expect(Object.keys(VIEWS)).toEqual([SEALAND_CLIENT_ID])
    expect(VIEWS[SEALAND_CLIENT_ID]).toEqual({ views: false, setAside: false })
    expect(viewsLive(viewsConfigFor(SEALAND_CLIENT_ID))).toBe(false)
  })

  it('gives a tenant with no maker rule no view at all (Össur), and never reads an inherited key', () => {
    expect(viewsConfigFor(OSSUR_CLIENT_ID)).toBeNull()
    expect(viewsConfigFor('toString')).toBeNull()
    expect(viewsConfigFor('00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('reads a view as live when either switch is on', () => {
    expect(viewsLive(null)).toBe(false)
    expect(viewsLive({ views: true, setAside: false })).toBe(true)
    expect(viewsLive({ views: false, setAside: true })).toBe(true)
  })
})
