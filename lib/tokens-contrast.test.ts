import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

// The palette's text-on-ground pairs, checked as numbers (Block D wave 3, SH7).
//
// WHY A TEST AND NOT A NOTE. `--muted-foreground` passed on white (4.79:1) and
// failed on `--inner` (4.46:1), and nothing said so for a year — because the
// only ground anyone checked it against was the canvas. The Block D ports are
// what put large amounts of muted text INSIDE tints, so the pair that matters
// is (ink, the ground it is actually painted on), and that pair is arithmetic
// off two tokens. `scripts/check-design-drift.sh` guards the hues; this guards
// the readings.
//
// Pure: it reads app/globals.css off disk and does the sRGB arithmetic. No
// browser, no snapshot of a rendered page.

const CSS = readFileSync('app/globals.css', 'utf8')

/** One token's hex, out of a named block of app/globals.css. */
function token(block: ':root' | '.dark', name: string): string {
  const start = CSS.indexOf(`${block} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  const body = CSS.slice(start, CSS.indexOf('\n}', start))
  const m = body.match(new RegExp(`\\n\\s*${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`))
  expect(m, `${block} ${name}`).not.toBeNull()
  return (m as RegExpMatchArray)[1]
}

const channel = (c: number): number => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4)
const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
/** WCAG 2.1 contrast ratio. */
export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('palette contrast', () => {
  it('reaches 4.5:1 for body ink on every ground the app paints it on', () => {
    for (const mode of [':root', '.dark'] as const) {
      const grounds = [token(mode, '--background'), token(mode, '--tile'), token(mode, '--inner')]
      for (const ink of ['--muted-foreground', '--secondary-foreground', '--foreground']) {
        for (const ground of grounds) {
          const ratio = contrast(token(mode, ink), ground)
          expect(ratio, `${mode} ${ink} on ${ground}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('reaches 4.5:1 for the hero tile\'s ink on the hero tile\'s ground', () => {
    for (const mode of [':root', '.dark'] as const) {
      expect(contrast(token(mode, '--hero-foreground'), token(mode, '--hero'))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('knows the reading it was written to catch', () => {
    // The retired value, on the tint the ports put it inside.
    expect(contrast('#6E7378', '#F6F7F8')).toBeLessThan(4.5)
    expect(contrast('#6E7378', '#FFFFFF')).toBeGreaterThan(4.5)
  })
})
