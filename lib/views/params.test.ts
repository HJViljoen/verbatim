import { describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { voiceSurfaceHref } from '../pages/voice-surface'
import { viewParams } from './conversation'

// `?view=` on Conversation's links (WP3.3 re-check): with no view live, a view
// in the address is read as nothing AND carried by nothing, so the page's
// theme, board and persona links are today's, href for href. Two stand-in
// tenants read the views here; Sealand and Össur keep the real switch (off).

const VIEWS_ON = 'views-on'
const ALL_ON = 'all-on'
vi.mock('./config', async (importOriginal) => {
  const real = await importOriginal<typeof import('./config')>()
  return {
    ...real,
    viewsConfigFor: (id: string) =>
      id === VIEWS_ON ? { views: true, setAside: false } : id === ALL_ON ? { views: true, setAside: true } : real.viewsConfigFor(id),
  }
})

describe('viewParams', () => {
  it('drops ?view= where no view is live, so no link carries it (the switch off; Össur)', () => {
    for (const id of [SEALAND_CLIENT_ID, OSSUR_CLIENT_ID]) {
      const p = viewParams(id, { month: '2026-09', view: 'buyers' })
      expect(p).toEqual({ month: '2026-09' })
      expect(voiceSurfaceHref(p, { theme: 't1' })).toBe('/dashboard/voice?month=2026-09&theme=t1')
    }
  })

  it('keeps a view the tenant reads that is not its default, and drops the default and anything unknown', () => {
    expect(viewParams(VIEWS_ON, { view: 'buyers', theme: 't1' })).toEqual({ view: 'buyers', theme: 't1' })
    expect(viewParams(VIEWS_ON, { view: 'market' })).toEqual({ view: 'market' })
    expect(viewParams(VIEWS_ON, { view: 'everything' })).toEqual({})
    expect(viewParams(VIEWS_ON, { view: 'nonsense' })).toEqual({})
    expect(viewParams(ALL_ON, { view: 'market' })).toEqual({})
    expect(viewParams(ALL_ON, { view: 'everything' })).toEqual({ view: 'everything' })
  })

  it('returns the params untouched where they carry no view', () => {
    const p = { month: '2026-09' }
    expect(viewParams(SEALAND_CLIENT_ID, p)).toBe(p)
  })
})
