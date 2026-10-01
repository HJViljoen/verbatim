import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// Palette A's two guards over the app's source (2026-10-01).
//
// (1) THE RETIRED GREEN IS GONE FROM THE APP. The 2026-08-28 green and its
//     tints did four jobs; palette A gives those jobs to ink, the brand
//     yellow, the gold and the orange. A literal of the old set, or a Tailwind
//     green, in app/, components/ or lib/ is the old palette coming back.
//     The marketing site (`app/site`, and `.site-theme` at the foot of
//     app/globals.css) keeps its own palette until Heinrich decides, and so do
//     the three favicon files, which every host serves, the site included.
//
// (2) NO LEFT STRIPE ON A CARD OR A QUOTE (Heinrich's design ban). A left
//     border wider than a 1px divider, in any colour, or an email's stripe cell
//     beside a quote. A 1px `border-l` between two columns is a divider and
//     passes.
//
// Pure: it reads the source off disk. Test files are not scanned: they assert
// these strings are ABSENT, so they have to be able to name them.

const ROOTS = ['app', 'components', 'lib']
const EXT = /\.(tsx?|css|svg|mjs|js)$/
const SITE = /^app\/site\//
/** Favicons and the home-screen icon: one set for every host, the marketing
 *  site's included, so they move with `.site-theme`, not with the app. */
const SHARED_WITH_SITE = new Set(['app/icon.svg', 'app/icon.tsx', 'app/apple-icon.tsx'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/** The app's own text of a file: globals.css stops at the marketing theme. */
function appText(path: string): string {
  const text = readFileSync(path, 'utf8')
  return path === 'app/globals.css' ? text.split('/* ── Marketing theme')[0] : text
}

const FILES = ROOTS.flatMap((r) => walk(r)).filter((p) => !SITE.test(p))

/** The 2026-08-28 green set, its rgb, and Tailwind's own greens. */
const RETIRED_GREEN = [
  /#(?:0E8A5F|DDF3E9|0B6E4C|2FBF85|173B2D|7EDDB4|0B1F16)\b/i,
  /rgba?\(\s*14\s*,\s*138\s*,\s*95\b/,
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|outline|decoration|divide|accent|caret|shadow)-(?:green|emerald|teal|lime)-\d{2,3}\b/,
]

/** A left border wider than 1px, in Tailwind, a style object or CSS; or an
 *  email table's narrow stripe cell with a background. */
const STRIPE = [
  /\bborder-[ls]-(?:[2-9]|\d{2,}|\[(?:[2-9]|\d{2,})(?:\.\d+)?(?:px|rem)\])(?![\w-])/,
  /\bborder(?:Left|InlineStart)(?:Width)?\s*:\s*['"`]?\s*(?:[2-9]|\d{2,})(?:\.\d+)?(?:px)?\b/,
  /\bborder-(?:left|inline-start)(?:-width)?\s*:\s*(?:[2-9]|\d{2,})(?:\.\d+)?px/,
  /<td\s+width=\{[2-6]\}\s+style=\{\{\s*background:/,
]

function hits(patterns: RegExp[], files: string[]): string[] {
  const out: string[] = []
  for (const f of files) {
    appText(f).split('\n').forEach((line, i) => {
      if (patterns.some((re) => re.test(line))) out.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`)
    })
  }
  return out
}

describe('palette A guard', () => {
  it('finds the source it is meant to scan', () => {
    expect(FILES).toContain('app/globals.css')
    expect(FILES).toContain('components/quote-block.tsx')
    expect(FILES).toContain('lib/email/theme.ts')
    expect(FILES.some((f) => SITE.test(f))).toBe(false)
  })

  it('carries no retired green in app, components or lib outside app/site', () => {
    const files = FILES.filter((f) => !SHARED_WITH_SITE.has(f) && f !== 'lib/palette-guard.test.ts')
    expect(hits(RETIRED_GREEN, files)).toEqual([])
  })

  it('draws no left stripe wider than 1px on a card or a quote', () => {
    expect(hits(STRIPE, FILES)).toEqual([])
  })

  it('knows the forms it was written to catch, and lets a divider through', () => {
    const caught = (line: string, set: RegExp[]) => set.some((re) => re.test(line))
    for (const line of [
      "className='border-l-2 border-primary/30 pl-3'",
      'className="border-l-4 border-border"',
      'className="border-l-[3px] border-you"',
      'className="border-s-2"',
      "style={{ borderLeft: '3px solid #FFD43B' }}",
      'style={{ borderLeftWidth: 2 }}',
      '.quote { border-left: 2px solid var(--border); }',
      '<td width={2} style={{ background: EMAIL.border, fontSize: 1 }}>&nbsp;</td>',
    ]) expect(caught(line, STRIPE), line).toBe(true)
    for (const line of [
      'className="border-l border-border pl-4"',
      'className="xl:border-l xl:pl-4 xl:first:border-l-0"',
      '  border-left: 1px solid var(--border);',
      "style={{ borderLeft: '1px solid #E4E2DC' }}",
    ]) expect(caught(line, STRIPE), line).toBe(false)
    for (const line of ["background: '#0e8a5f'", 'rgba(14,138,95,.3)', 'className="text-green-600"', 'bg-emerald-50']) {
      expect(caught(line, RETIRED_GREEN), line).toBe(true)
    }
    expect(caught("background: '#FFD43B'", RETIRED_GREEN)).toBe(false)
  })
})
