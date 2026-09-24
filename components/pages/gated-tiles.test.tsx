import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

  it('keeps the gated key out of every slide, in every variant, while the reader is off', () => {
    if (directionWordsFor(reader)) return
    for (const variant of ['default', 'full'] as const) {
      const named = mod.slides(data, variant).flatMap((s) => s.keys)
      expect(named, variant).not.toContain(gatedKey)
    }
  })
})

// The list above is hand-written, so something has to notice when a later
// package gates a third tile off its catalogue. This reads the page modules and
// fails if one registers a renderable behind `...(directionWordsFor(…)` — the
// idiom that takes a key OUT of the registry, which is the bug class these
// tests exist for — without being covered here. A `directionWordsFor` call
// INSIDE a tile's JSX (dashboard's New chip, competitive's footer note) changes
// no key and is deliberately not matched.
describe('the gated-tile list', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const covered = new Set(modules.map((m) => m.name as string))

  it('covers every page that gates a tile out of its registry', () => {
    const gating = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => /\.\.\.\(\s*directionWordsFor\(/.test(readFileSync(`${dir}${e.name}/index.tsx`, 'utf8')))
      .map((e) => e.name)
    expect(gating.length).toBeGreaterThan(0)
    for (const name of gating) {
      expect(covered, `${name} gates a tile out of its registry — add it to the modules list above`).toContain(name)
    }
  })
})
