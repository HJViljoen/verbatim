import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { tipListeners } from './week-tip'

// The week charts' tooltip (Heinrich, 5 Oct): what it listens for on the
// document. No jsdom in this tier, so the rule is a pure function and the hook
// is pinned to it by its source.

describe('the week tooltip\'s document listeners', () => {
  it('listens for Escape whenever a week is shown, by hover, focus or a tap', () => {
    expect(tipListeners(null, null)).toEqual({ escape: false, outside: false })
    expect(tipListeners(2, null)).toEqual({ escape: true, outside: false })
    expect(tipListeners(0, null)).toEqual({ escape: true, outside: false })
  })

  it('listens for a tap outside the chart only while a week is pinned by a tap', () => {
    expect(tipListeners(null, 1)).toEqual({ escape: true, outside: true })
    expect(tipListeners(3, 1)).toEqual({ escape: true, outside: true })
  })

  it('the hook registers Escape on that rule and the tap outside on the pin', () => {
    const src = readFileSync(resolve(__dirname, 'week-tip.tsx'), 'utf8')
    expect(src).toMatch(/const listen = tipListeners\(active, pinned\)/)
    expect(src).toMatch(/if \(!listen\.escape\) return\s+const escape[\s\S]*?addEventListener\('keydown', escape\)[\s\S]*?\}, \[listen\.escape\]\)/)
    expect(src).toMatch(/if \(!listen\.outside\) return\s+const outside[\s\S]*?addEventListener\('pointerdown', outside\)[\s\S]*?\}, \[listen\.outside, box\]\)/)
  })
})
