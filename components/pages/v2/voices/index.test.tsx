import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { VOICES_FIXTURES } from '@/lib/pages/v2/voices-fixture'
import { VoicesMeta, VoicesPage } from '.'

describe('the Voices page (boards E3-Voices and E3-Voices-Open)', () => {
  it('keeps the copy contract on every fixture, open or not', () => {
    for (const f of Object.values(VOICES_FIXTURES)) assertCopyContract(<VoicesPage data={f()} />)
  })

  it('says "this month" nowhere: the page reads a named month', () => {
    for (const f of Object.values(VOICES_FIXTURES)) expect(renderText(<VoicesPage data={f()} />)).not.toMatch(/this month/i)
  })

  it('prints no quote at level 1: quotes are the panels\'', () => {
    for (const key of ['ossur', 'sealand'] as const) {
      expect(render(<VoicesPage data={VOICES_FIXTURES[key]()} />)).not.toContain('data-copy="quote"')
    }
  })

  it('the bar: the month, the market\'s videos, the groups, the regular creators, the brands; no period switch', () => {
    const d = VOICES_FIXTURES.ossur()
    expect(renderText(<VoicesMeta data={d} />)).toBe('September · 487 videos · 5 groups · 6 regular creators · 2 brands')
    const m = render(<VoicesPage data={d} />)
    expect(m).toContain('>Voices</h1>')
    expect(m).not.toContain('aria-label="Period"')
  })

  it('draws the sections in the board\'s order and no mix-change card (decision 2)', () => {
    const text = renderText(<VoicesPage data={VOICES_FIXTURES.sealand()} />)
    const at = (s: string) => text.indexOf(s)
    expect(at('Who’s in your market')).toBeLessThan(at('One-bag travellers Pack light'))
    expect(at('One-bag travellers Pack light')).toBeLessThan(at('Brands in your market'))
    expect(at('Brands in your market')).toBeLessThan(at('Creators who drive the talk'))
    expect(text).not.toContain('How the mix changed')
  })

  it('a brand\'s or a creator\'s panel opens under the pair, one at a time', () => {
    const m = render(<VoicesPage data={VOICES_FIXTURES['sealand-brand']()} />)
    expect(m.indexOf('id="brand-panel"')).toBeGreaterThan(m.indexOf('Creators who drive the talk'))
    expect(m).not.toContain('id="creator-panel"')
    expect(m).not.toContain('id="group-panel"')
    const c = render(<VoicesPage data={VOICES_FIXTURES['ossur-creator']()} />)
    expect(c).toContain('id="creator-panel"')
  })
})
