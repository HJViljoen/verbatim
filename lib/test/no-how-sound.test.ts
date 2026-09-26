import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// NO "HOW SOUND" STRING SHIPS (25 Sep rulings, plan §5.12; market-first WP1.2).
//
// The copy search the plan names, as a test: over `app`, `components` and
// `lib`, every "how sound" (any case) that is not in a test or a code comment
// is a string a reader could meet. The page bar's pill and its dialog, Ask's
// band, OV6 on the front page, Settings › How to read's card and the readiness
// row's block name all went with WP1.2.
//
// NO FILE IS ALLOWED ANY MORE (market-first WP2.1). The last one was
// `components/pages/overview/record.tsx`, the OV6 block the monthly rendered as
// `monthly.sound`; WP2.1's "September in your market" retired that section
// with the other version 1 keys, and the block went with it. The weekly's
// `weekly.coverage` prints no such string.
const ALLOWED = new Set<string>()

const ROOT = join(__dirname, '..', '..')

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** The file with its comments taken out: block comments (JSX's `{/* … *\/}`
 *  included) and line comments that start a line or follow whitespace, so a
 *  URL's `https://` is not taken for one. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n')
}

describe('no "how sound" string a reader can meet', () => {
  it('strips comments and keeps strings', () => {
    expect(withoutComments('// How sound is this\nconst a = 1')).not.toContain('How sound')
    expect(withoutComments('{/* How sound is this */}')).not.toContain('How sound')
    expect(withoutComments("const t = 'How sound is this' // note")).toContain('How sound')
    expect(withoutComments("const u = 'https://example.com/how'")).toContain('https://example.com/how')
  })

  it('is found in no source file', () => {
    const files = ['app', 'components', 'lib'].flatMap((d) => sources(join(ROOT, d)))
    expect(files.length).toBeGreaterThan(100)
    const hits = files
      .map((f) => relative(ROOT, f))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /how sound/i.test(withoutComments(readFileSync(join(ROOT, f), 'utf8'))))
    expect(hits).toEqual([])
  })

  it('the monthly no longer arranges the section, so nothing needs allowing', () => {
    const monthly = readFileSync(join(ROOT, 'lib/reports/monthly.ts'), 'utf8')
    const keys = monthly.slice(monthly.indexOf('export const MONTHLY_BLOCK_KEYS'), monthly.indexOf('export type MonthlyBlockKey'))
    expect(keys).not.toContain("'monthly.sound'")
    expect(ALLOWED.size).toBe(0)
  })
})
