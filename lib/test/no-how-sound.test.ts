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
// THE ONE ALLOWED FILE, AND WHY. `components/pages/overview/record.tsx` is the
// OV6 block, which is no longer on the front page but still renders the
// monthly report's `monthly.sound` section until WP2.1 rebuilds that artefact
// (deploy 3; no monthly is built before it). The weekly's `weekly.coverage`
// prints no such string. When WP2.1 lands, this list empties.
const ALLOWED = new Set(['components/pages/overview/record.tsx'])

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

  it('is found in no source file outside the one the monthly still renders', () => {
    const files = ['app', 'components', 'lib'].flatMap((d) => sources(join(ROOT, d)))
    expect(files.length).toBeGreaterThan(100)
    const hits = files
      .map((f) => relative(ROOT, f))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /how sound/i.test(withoutComments(readFileSync(join(ROOT, f), 'utf8'))))
    expect(hits).toEqual([])
  })

  it('the allowed file is still the OV6 block the monthly renders, so the list stays honest', () => {
    for (const f of ALLOWED) {
      const text = readFileSync(join(ROOT, f), 'utf8')
      expect(text).toContain("key: 'overview.record'")
    }
    const monthly = readFileSync(join(ROOT, 'components/blocks/monthly/index.tsx'), 'utf8')
    expect(monthly).toContain("'monthly.sound': fromOverview('monthly.sound', overviewRecord")
  })
})
