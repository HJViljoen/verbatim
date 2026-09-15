import { describe, it, expect } from 'vitest'
import { voicePage } from './voice'
import { profilePage } from './profile'
import { directionWordsFor } from '@/lib/config'

// A gated tile leaves the catalogue, and everything that names a tile key has
// to leave with it. Gating `profile.mix` in WP0 unregistered
// `profile.shareOverTime` while ProfilePage still read
// `renderables['profile.shareOverTime'].render(...)` — a TypeError on the
// Consumer Profile page, invisible to tsc because a `Record<string,
// Renderable>` index is typed as always present, and invisible to the four
// gates because nothing renders that page offline. It was caught by reading
// the call sites, which is not a method.
//
// These assert the neighbours of that bug — every key a slide names resolves
// in its own registry, in both variants, and each gated key is in the
// catalogue exactly when its reader is on. They do NOT cover the app render
// path itself; the honest guard there is `renderables[k]?.render(…)`, which
// every page but this one already used. WP10, which registers a block per
// page, should make that the rule.

const modules = [
  { name: 'voice', mod: voicePage, gatedKey: 'voice.movers', reader: 'voice.movers' },
  { name: 'profile', mod: profilePage, gatedKey: 'profile.shareOverTime', reader: 'profile.mix' },
] as const

describe.each(modules)('$name — gated tiles', ({ mod, gatedKey, reader }) => {
  // `slides` reads the loaded data only for the per-item slides of the `full`
  // variant; the fixed slides this guards need nothing from it.
  const data = {} as never

  it('names no slide key the registry cannot resolve', () => {
    for (const variant of ['default', 'full'] as const) {
      for (const slide of mod.slides(data, variant)) {
        for (const key of slide.keys) {
          expect(mod.renderables[key], `${variant} slide "${slide.title}" names ${key}`).toBeTruthy()
        }
      }
    }
  })

  it('offers the gated tile exactly when its reader is on', () => {
    expect(Boolean(mod.renderables[gatedKey])).toBe(directionWordsFor(reader))
  })

  it('keeps the gated key out of every slide while the reader is off', () => {
    if (directionWordsFor(reader)) return
    const named = mod.slides(data, 'default').flatMap((s) => s.keys)
    expect(named).not.toContain(gatedKey)
  })
})
