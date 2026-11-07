import { describe, expect, it, vi } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { StatStrip } from '@/components/v2'
import { AgentDocumentView, leadSentence, PlanJudgement } from '@/components/agent-document'
import { AgentDocumentSplit, SHADING_LINE } from '@/components/agent-document-split'
import { askSub, planCheckStats } from './surface'
import { planCheckFixture } from './fixture'

// The plan check (the audit design, 7 Nov, Agent-Thread.dc.html): the figures
// row, the claims as ruled rows with a numbered heading and a verdict tag, the
// document as a tile with the shading said in its line, and "What I'd take
// from that" as its own tile. Render tier: what it PRINTS.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))

const d = planCheckFixture()
const doc = d.document!
const quotes = new Map(Object.entries(doc.quotesByClaim).map(([ref, qs]) => [ref, qs.map((q) => ({ text: q.text, lang: q.lang, english: q.english }))]))
const text = (node: React.ReactNode) => renderText(node).replace(/\s+/g, ' ').replace(/\s+([,.:])/g, '$1')

describe('the plan check', () => {
  it('says its plan, when it was asked, what it was checked against and its claims by verdict in the figures row', () => {
    const strip = <StatStrip items={planCheckStats(d)} />
    expect(text(strip)).toBe('Plan Built For The Day, a brand campaign proposal Asked Sat 22 Aug Checked against The update of 27 Sep 6 claims 1 supported, 3 contradicted, 2 untested')
    expect(render(strip)).toContain('data-slot="ask_extract_title"')
    assertCopyContract(strip)
    // A verdict no claim earned is left out, never "0 untested".
    const clean = { ...d, document: { ...doc, summary: { supported: 6, contradicted: 0, untested: 0 } } }
    expect(text(<StatStrip items={planCheckStats(clean)} />)).toContain('6 claims 6 supported')
    expect(text(<StatStrip items={planCheckStats(clean)} />)).not.toMatch(/0 (contradicted|untested)/)
  })

  it('names the brand and the month under its title', () => {
    expect(askSub({ brand: 'Össur', reading: d.bar.reading })).toBe('Össur, September 2026')
    expect(askSub({ brand: 'Össur', reading: null })).toBe('Össur')
    expect(askSub(null)).toBeNull()
  })

  it('draws each claim as a ruled row: its number, the claim as a heading, its verdict as a tag', () => {
    const node = <AgentDocumentView claims={doc.claims} quotesByClaim={quotes} anchored={new Set(doc.anchored)} />
    const m = render(node)
    expect(m.match(/<article data-ref="C\d"/g)).toHaveLength(6)
    expect(m).toMatch(/<h3[^>]*>Össur competes in a category/)
    expect(m).toMatch(/data-tag="hi"[^>]*>Contradicted</)
    expect(m).toMatch(/data-tag="mid"[^>]*>Untested</)
    expect(m).toMatch(/data-tag="tint"[^>]*>Supported</)
    const t = text(node)
    expect(t).toContain('In summary People ask what the product is for')
    expect(t).toContain('22 conversations: Questions about Ossur pricing, Questions about Ossur performance, How to contact Ossur')
    // An untested claim stops at its tag; one the document never states says so.
    expect(t).toContain('One ambassador outperforms a roster for recall. Untested Not stated directly in the document.')
    expect(t).not.toMatch(/[·→]|supported ·/)
    expect(m).not.toMatch(/uppercase|font-mono|rounded-full/)
  })

  it('shades the document with plain spans, says what the shading means, and leaves untested claims plain', () => {
    const m = render(<AgentDocumentSplit claims={doc.claims} quotesByClaim={quotes} segments={doc.segments} anchored={doc.anchored} notice={null} />)
    expect(m).not.toContain('<mark')
    expect(m).toContain(SHADING_LINE)
    expect(m).toMatch(/<span data-ref="C1" data-shade="contradicts" class="[^"]*\bbg-caution-soft\b/)
    expect(m).toMatch(/<span data-ref="C5" data-shade="echoes" class="[^"]*\bbg-accent\b/)
    expect(m).not.toMatch(/data-ref="C3" data-shade/)
    // Two tiles that flow with the page, tabs below lg on the segmented control.
    expect(m).toMatch(/<h2 id="plan-check-title"[^>]*>The check, claim by claim<\/h2>/)
    expect(m).toMatch(/<h2 id="plan-doc-title"[^>]*>Your document<\/h2>/)
    expect(m).not.toMatch(/overflow-y-auto/)
    expect(m).toMatch(/<button type="button" aria-pressed="true"[^>]*>The check<\/button>/)
  })

  it('takes what it would do as its own tile, each first sentence in bold, each tracing its claims', () => {
    const node = <PlanJudgement claims={doc.claims} judgement={doc.judgement} />
    const m = render(node)
    expect(m).toMatch(/<h2[^>]*>What I’d take from that<\/h2>/)
    expect(m).toMatch(/<span class="font-semibold">Reframe the category as explained, not assumed\.<\/span>/)
    expect(text(node)).toContain('Reasoning from claims 1, 4 above.')
    expect(render(<PlanJudgement claims={doc.claims} judgement={[]} />)).toBe('')
    expect(leadSentence('One sentence only.')).toBeNull()
    expect(leadSentence('First one. Second one.')).toEqual({ lead: 'First one.', rest: 'Second one.' })
  })
})
