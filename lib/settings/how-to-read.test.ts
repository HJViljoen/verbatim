import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { GLOSSARY, THIRTEEN_WORDS } from '../calibration'
import { DIRECTION_WORDS } from '../calibration'
import { SURFACES } from '../nav'
import { DEFINITIONS, READING_CARDS, READING_PATH } from './how-to-read'

describe('how to read', () => {
  it('describes every surface the shell has, and no other', () => {
    expect(READING_CARDS.map((c) => c.key)).toEqual(SURFACES.map((s) => s.key))
  })

  it('repeats neither the title nor the question — lib/nav.ts owns both', () => {
    for (const card of READING_CARDS) {
      const s = SURFACES.find((x) => x.key === card.key)!
      expect(card).not.toHaveProperty('title')
      expect(card.tells).not.toBe(s.question)
    }
  })

  it('names only real glossary words', () => {
    for (const card of READING_CARDS) {
      for (const key of card.read) expect(GLOSSARY[key]).toBeDefined()
    }
  })

  it('draws its vocabulary from the thirteen and their two flags, not the legacy words', () => {
    const allowed = new Set<string>([...THIRTEEN_WORDS, 'new', 'gone_quiet'])
    for (const card of READING_CARDS) {
      for (const key of card.read) expect(allowed.has(key)).toBe(true)
    }
  })

  it('says what every surface cannot tell you — the half a reader asks for least', () => {
    for (const card of READING_CARDS) expect(card.cannot.length).toBeGreaterThan(0)
  })

  it('does not carry the Guide’s false claim about search terms', () => {
    const settings = READING_CARDS.find((c) => c.key === 'settings')!
    const words = [settings.tells, ...settings.cannot].join(' ')
    expect(words).not.toContain('changed by us on request, not from this page')
    // The true half survives, and the correction with it.
    expect(words).toContain('Your search terms are yours')
  })

  it('reads on three clocks, in the order a month is actually read', () => {
    expect(READING_PATH.map((p) => p.when)).toEqual([
      'Each week', 'Each month, once the month is done', 'Each quarter',
    ])
    for (const step of READING_PATH) expect(step.what.length).toBeGreaterThan(0)
  })

  it('prints no direction word of its own outside the word that defines one', () => {
    // The cards are prose about the product, not a verdict, so D1's rule
    // applies to them exactly as it applies to a block: gaining and fading are
    // earned by three readings and are never furniture.
    const prose = READING_CARDS.flatMap((c) => [c.tells, ...c.cannot]).join(' ').toLowerCase()
    for (const word of DIRECTION_WORDS) {
      if (word === 'grew' || word === 'faded') continue // "what grew and faded" is a panel's NAME
      expect(prose).not.toContain(` ${word} `)
    }
  })

  it('gives every definition a unique anchor that no surface card already uses', () => {
    const ids = DEFINITIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(READING_CARDS.some((c) => c.key === id)).toBe(false)
    for (const d of DEFINITIONS) expect(`${d.title} ${d.body}`).not.toContain('—')
  })

  it('carries exactly one definition of New, and the glossary agrees with it', () => {
    const nw = DEFINITIONS.filter((d) => d.id === 'new')
    expect(nw).toHaveLength(1)
    expect(nw[0].body).toContain('no earlier month in our record')
    expect(GLOSSARY.new[1]).toContain('no earlier month in our record')
  })
})

// ---- the legend pills link into this page --------------------------------

const ROOT = join(__dirname, '..', '..')
function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p)
  }
  return out
}

describe('How-to-read legend pills', () => {
  const files = [...sources(join(ROOT, 'components')), ...sources(join(ROOT, 'app'))]
  const pills = files.flatMap((f) => {
    const text = readFileSync(f, 'utf8')
    return [...text.matchAll(/<HowToRead\b[^>]*?\banchor="([^"]+)"/g)].map((m) => ({ file: f, anchor: m[1] }))
  })
  const anchors = new Set<string>([...READING_CARDS.map((c) => c.key), ...DEFINITIONS.map((d) => d.id)])

  it('finds the pills it is checking', () => {
    expect(pills.length).toBeGreaterThan(0)
  })

  it('points every pill at an anchor that exists on Settings › How to read', () => {
    for (const p of pills) expect(anchors.has(p.anchor), `${p.file} → #${p.anchor}`).toBe(true)
  })

  it('puts the same pill on every reading page', () => {
    const pages = {
      overview: 'components/pages/overview/index.tsx',
      subjects: 'components/pages/subjects/index.tsx',
      // Voice mounts its pill from the route (useSearchParams must sit under
      // the page's Suspense boundary there), so the route file is the one read.
      voice: 'app/dashboard/voice/page.tsx',
      market: 'components/pages/market-surface/index.tsx',
      competitive: 'components/pages/competitive-surface/index.tsx',
      week: 'components/pages/week/index.tsx',
    }
    for (const [key, file] of Object.entries(pages)) {
      const text = readFileSync(join(ROOT, file), 'utf8')
      expect(text, file).toMatch(new RegExp(`<HowToRead\\b[^>]*anchor="${key}"`))
    }
  })
})
