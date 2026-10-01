import { describe, expect, it } from 'vitest'

import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { sealandRead } from '@/lib/test/weekly-read-fixture'
import { weekReadPage, type WeekReadPageData } from '@/lib/pages/week-read'
import type { AttributionInputs } from '@/lib/brands/attribution'
import { AlsoHeardCard, stripEmoji, WEEK_READ_FIRST, WeekReadCard, WeekReadPage } from './read-page'

// This week, the render tier (the pages build): the artboard's two cards, the
// copy contract, the design bans, and nothing empty printed.

const COTO = 'c0000000-0000-0000-0000-000000000001'
const PATA = 'c0000000-0000-0000-0000-000000000002'
const F1 = Array.from({ length: 16 }, (_, i) => `v${i}`)
const names = { client: 'Sealand', market: { long: 'Other bags in your market', short: 'other bags' } }

function attribution(): AttributionInputs {
  const audiences = new Map(F1.map((v) => [v, 'industry-other']))
  audiences.set('v0', 'competitor:Cotopaxi')
  audiences.set('v1', 'competitor:Cotopaxi')
  for (const v of ['q1', 'x1', 'x2', 'x3']) audiences.set(v, 'industry-other')
  audiences.set('w1', 'industry-other')
  return {
    audiences,
    namings: new Map([
      ['v2', [{ brandKey: PATA, commentId: 'c2', month: '2026-09-01' }]],
      ['v3', [{ brandKey: PATA, commentId: 'c3', month: '2026-09-01' }]],
      ['w1', [{ brandKey: COTO, commentId: 'cw', month: '2026-09-01' }]],
    ]),
    brands: { client: 'Sealand', rivals: new Map([[COTO, 'Cotopaxi'], [PATA, 'Patagonia']]), counts: () => true },
  }
}

function data(over: Parameters<typeof sealandRead>[0] = {}): WeekReadPageData {
  const base = sealandRead()
  const read = sealandRead({
    findings: base.findings.map((f, i) => (i === 0 ? { ...f, monthVideoIds: F1 } : f)),
    alsoHeard: [
      { themeId: 'ta', label: 'Confusion over airline size rules', videos: 3, videoIds: ['x1', 'x2', 'x3'] },
      { themeId: 'tb', label: 'Cotopaxi praised for practical travel', videos: 3, videoIds: ['w1'] },
    ],
    ...over,
  })
  return weekReadPage({
    read,
    brand: 'Sealand',
    names,
    attribution: attribution(),
    themeComments: new Map([['t1', new Set(['c2', 'c3'])], ['tb', new Set(['cw'])]]),
    origins: new Map([['e:e2aa9829-a7ec-4947-ac47-387a9a14133c', { commentId: 'cq', videoId: 'q1' }]]),
  })
}

const page = (d: WeekReadPageData | null = data()) => <WeekReadPage data={d} title="This week" />

describe('This week, the page', () => {
  it('prints the artboard’s order: the title, In short, each finding, then Also heard', () => {
    const text = renderText(page())
    const at = (s: string) => text.indexOf(s)
    expect(at('This week')).toBe(0)
    expect(at('In short')).toBeGreaterThan(0)
    expect(at('Buyers treated bag choice')).toBeGreaterThan(at('In short'))
    expect(at('Buyers ask for named alternatives')).toBeGreaterThan(at('Buyers treated bag choice'))
    expect(at('Colour choice can decide')).toBeGreaterThan(at('Buyers ask for named alternatives'))
    expect(at('Also heard this week')).toBeGreaterThan(at('A high price is accepted'))
  })

  it('a finding: headline, what was seen, What it means, the quote with where and who, the evidence, the brand line, the context', () => {
    const text = renderText(page())
    expect(text).toContain('What it means')
    expect(text).toContain('If you think you’ll be doing a lot of walking with the backpack')
    expect(text).toContain('Reddit · 21 Sep · Other bags in your market')
    expect(text).toContain('7 videos this week · 16 in September so far')
    expect(text).toContain('In September: Cotopaxi 2 · Patagonia 2 · other bags 12')
    // The design's words (Heinrich, 1 Oct): the rank from code, no figure.
    expect(text).toContain('Part of Buying & delivery, the biggest subject in your market this month.')
    expect(text).not.toContain('23% of 852 videos')
    expect(render(page())).toContain('id="finding-1"')
  })

  it('prints nothing empty: no quote panel, no brand line and no context line where the read has none', () => {
    const html = render(<WeekReadCard data={data()} />)
    // Three findings, one quote: the two others print no panel.
    expect(copyNodes(html).filter((n) => n.kind === 'quote')).toHaveLength(1)
    // Only the first finding has its month videos stored.
    expect(renderText(<WeekReadCard data={data()} />).match(/In September: /g)).toHaveLength(1)
  })

  it('also heard: each conversation, who it is about and its videos', () => {
    const text = renderText(<AlsoHeardCard data={data()} />)
    expect(text).toContain('Confusion over airline size rules')
    expect(text).toContain('Other bags in your market')
    expect(text).toContain('Cotopaxi praised for practical travel')
    expect(text).toMatch(/Cotopaxi praised for practical travel\s*Cotopaxi\s*3 videos/)
  })

  it('leaves Also heard out when nothing else was heard', () => {
    expect(render(<AlsoHeardCard data={data({ alsoHeard: [] })} />)).toBe('')
    expect(renderText(page(data({ alsoHeard: undefined })))).not.toContain('Also heard')
  })

  it('a workspace with no read yet gets one neutral line', () => {
    expect(renderText(page(null))).toBe(`This week ${WEEK_READ_FIRST}`)
  })

  it('keeps the copy contract and the design bans', () => {
    const html = render(page())
    assertCopyContract(html)
    expect(html).not.toContain('—')
    expect(html).not.toMatch(/border-left|borderLeft|border-l-|border-l\b/i)
    expect(html).not.toMatch(/<mark\b/i)
  })

  it('strips emoji from printed words', () => {
    expect(stripEmoji('so cute 😍😍 love it ✨')).toBe('so cute love it')
  })
})
