import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// Palette A's two guards over the app's source (2026-10-01).
//
// (1) THE RETIRED GREEN IS GONE FROM THE BRAND. The 2026-08-28 green and its
//     tints did four jobs; palette A gives those jobs to ink, the brand
//     yellow, the gold and the orange. A literal of the old set, or a Tailwind
//     green, in app/, components/, lib/ or public/ is the old palette coming
//     back. Since the whole brand moved to yellow (2026-10-01) that includes
//     the marketing site (`app/site` and `.site-theme`), its old Room and mint,
//     the favicons, the share card, the mark files and the crowd's pine, so
//     nothing is exempt. scripts/check-design-drift.sh (f) holds the site to
//     its allow-list; this holds every file to the retired set.
//
// (2) NO LEFT STRIPE ON A CARD OR A QUOTE (Heinrich's design ban). A left
//     border wider than a 1px divider, in any colour, or an email's stripe cell
//     beside a quote. A 1px `border-l` between two columns is a divider and
//     passes.
//
// Pure: it reads the source off disk. Test files are not scanned: they assert
// these strings are ABSENT, so they have to be able to name them.

const ROOTS = ['app', 'components', 'lib', 'public']
const EXT = /\.(tsx?|css|svg|mjs|js)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

const FILES = ROOTS.flatMap((r) => walk(r))

/** The 2026-08-28 green set and its rgb; the site's old Room, mint and the
 *  greens that sat on the Room; the 2026-07 pine the crowd art still drew;
 *  and Tailwind's own greens. */
const RETIRED_GREEN = [
  /#(?:0E8A5F|DDF3E9|0B6E4C|2FBF85|173B2D|7EDDB4|0B1F16)\b/i,
  /#(?:0F1F19|3DBF8C|9FC3B2|8FA79A|C9D8CF|EEF3EF|DCE6E0|E3ECE6|14503A)\b/i,
  /rgba?\(\s*14\s*,\s*138\s*,\s*95\b/,
  /rgba?\(\s*(?:15\s*,\s*31\s*,\s*25|159\s*,\s*195\s*,\s*178)\b/,
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
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (patterns.some((re) => re.test(line))) out.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`)
    })
  }
  return out
}

describe('palette A guard', () => {
  it('finds the source it is meant to scan, the site and the brand art included', () => {
    for (const f of ['app/globals.css', 'components/quote-block.tsx', 'lib/email/theme.ts', 'app/site/site.css',
      'app/icon.svg', 'app/icon.tsx', 'app/apple-icon.tsx', 'app/opengraph-image.tsx', 'public/crowd.svg',
      'public/brand/verbatim-mark.svg']) expect(FILES).toContain(f)
  })

  it('carries no retired green anywhere: app, the site, components, lib or public', () => {
    expect(hits(RETIRED_GREEN, FILES)).toEqual([])
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
    for (const line of ["background: '#0e8a5f'", 'rgba(14,138,95,.3)', 'className="text-green-600"', 'bg-emerald-50',
      '--room: #0F1F19;', 'const MINT = "#3DBF8C"', 'stroke="#14503A"', 'rgba(15,31,25,.98) 0%', 'border-bottom: 1px solid rgba(159,195,178,.22)']) {
      expect(caught(line, RETIRED_GREEN), line).toBe(true)
    }
    expect(caught("background: '#FFD43B'", RETIRED_GREEN)).toBe(false)
    expect(caught('--room: #1F2124;', RETIRED_GREEN)).toBe(false)
  })
})
