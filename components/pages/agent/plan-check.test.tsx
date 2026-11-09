import { describe, expect, it, vi } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { StatStrip } from '@/components/v2'
import { AgentDocumentView, leadSentence, PlanJudgement } from '@/components/agent-document'
import { AgentDocumentSplit, SHADING_LINE } from '@/components/agent-document-split'
import { askSub, planCheckStats } from './surface'
import { toFloor } from '@/lib/ask/verdicts'
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
    expect(t).toContain('At least 22 videos behind it, from these conversations: Questions about Ossur pricing, Questions about Ossur performance, How to contact Ossur')
    // An untested claim stops at its tag; one the document never states says so.
    expect(t).toContain('One ambassador outperforms a roster for recall. Untested Not stated directly in the document.')
    expect(t).not.toMatch(/[·→]|supported ·/)
    expect(m).not.toMatch(/uppercase|font-mono|rounded-full/)
  })

  it('counts a claim\'s videos as videos and names its conversations apart (9 Nov: "1 conversation:" over five names)', () => {
    // The live plan check's claim 6: one video behind it, read against five
    // conversations. The count is `conversationCount`, the distinct videos
    // behind the claim's quotes (lib/ask/verdicts.ts), the number Your moves
    // prints as "at least N videos behind it"; the names are its themes.
    const five = ['Who this prosthesis fits', 'Young amputees and milestones', 'Military amputees and varied levels', 'Young child prosthetic users', 'Rehabilitation and disability audience']
    const claim = { ...doc.claims.find((c) => c.verdict === 'contradicts')!, conversationCount: 1, themeRefs: five.map((label, i) => ({ themeId: `t${i}`, registryId: `r${i}`, label })) }
    const t = text(<AgentDocumentView claims={[claim]} quotesByClaim={quotes} />)
    expect(t).toContain(`At least 1 video behind it, from these conversations: ${five.join(', ')}`)
    expect(t).not.toMatch(/\b1 conversation\b/)
    const one = text(<AgentDocumentView claims={[{ ...claim, conversationCount: 7, themeRefs: [claim.themeRefs[0]] }]} quotesByClaim={quotes} />)
    expect(one).toContain('At least 7 videos behind it, from this conversation: Who this prosthesis fits')
    const none = text(<AgentDocumentView claims={[{ ...claim, conversationCount: 3, themeRefs: [] }]} quotesByClaim={quotes} />)
    expect(none).toContain('At least 3 videos behind it.')
    assertCopyContract(<AgentDocumentView claims={[claim]} quotesByClaim={quotes} />)
  })

  it('says a claim under the floor is untested, once, in the tag\'s word, and nothing more (9 Nov: "Contradicted" on one video)', () => {
    // Össur's claims 6 and 12 as stored at upload: contradicted on one and
    // three videos. `currentReading` holds every printed reading to today's
    // five-video floor (`toFloor`), so the thread draws them as untested.
    const thin = { ...doc.claims.find((c) => c.verdict === 'contradicts')!, conversationCount: 1 }
    const t = text(<AgentDocumentView claims={[toFloor(thin)]} quotesByClaim={quotes} />)
    expect(t.match(/Untested/g)).toHaveLength(1)
    expect(t).not.toMatch(/Contradicted|At least|In summary|behind it/)
    // A claim at the floor keeps its verdict and its count.
    const five = text(<AgentDocumentView claims={[toFloor({ ...thin, conversationCount: 5 })]} quotesByClaim={quotes} />)
    expect(five).toContain('Contradicted')
    expect(five).toContain('At least 5 videos behind it')
  })

  it('names the original reading once, in a plain sentence, where a re-reading is printed', () => {
    const was = 'On 22 Aug this read 2 supported, 8 contradicted, 5 untested.'
    const node = <AgentDocumentSplit claims={doc.claims} quotesByClaim={quotes} segments={doc.segments} anchored={doc.anchored} notice={null} was={was} />
    const m = render(node)
    expect(m.split(was)).toHaveLength(2)
    expect(m).toMatch(/<p class="[^"]*text-\[14px\][^"]*">On 22 Aug this read/)
    assertCopyContract(node)
    expect(render(<AgentDocumentSplit claims={doc.claims} quotesByClaim={quotes} segments={doc.segments} anchored={doc.anchored} notice={null} was={null} />)).not.toContain('this read')
  })

  it('says whether people raise an untested claim at all, once, under its tag (9 Nov)', () => {
    const silent = doc.claims.find((c) => c.verdict === 'silent')!
    const t = (c: typeof silent) => text(<AgentDocumentView claims={[c]} quotesByClaim={quotes} />)
    expect(t({ ...silent, raisedIn: 3 })).toContain('Untested Raised in 3 videos, too few to judge.')
    expect(t({ ...silent, raisedIn: 0 })).toContain('Untested Nobody raises it.')
    expect(t({ ...silent, raisedIn: undefined })).toContain('Untested Too few videos to judge.')
    expect(t({ ...silent, raisedIn: 3 }).match(/too few to judge/g)).toHaveLength(1)
    // A claim with a verdict says none of it.
    expect(t(doc.claims.find((c) => c.verdict === 'contradicts')!)).not.toMatch(/too few|Nobody raises/)
    const m = render(<AgentDocumentView claims={[{ ...silent, raisedIn: 3 }]} quotesByClaim={quotes} />)
    expect(m).toMatch(/<p class="[^"]*text-\[13\.5px\][^"]*">Raised in 3 videos, too few to judge\.<\/p>/)
    assertCopyContract(<AgentDocumentView claims={[{ ...silent, raisedIn: 3 }]} quotesByClaim={quotes} />)
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

  it('dates what it would do once, under its heading: the day and the reading it was written on (9 Nov)', () => {
    const written = 'Written 8 Nov, on that update’s reading.'
    const node = <PlanJudgement claims={doc.claims} judgement={doc.judgement} written={written} />
    const m = render(node)
    expect(m.split(written)).toHaveLength(2)
    expect(m).toMatch(/<\/h2><p class="[^"]*text-\[14px\][^"]*">Written 8 Nov, on that update’s reading\.<\/p>/)
    assertCopyContract(node)
  })

  it('takes what it would do as its own tile, each first sentence in bold, each tracing its claims', () => {
    const node = <PlanJudgement claims={doc.claims} judgement={doc.judgement} />
    const m = render(node)
    expect(m).toMatch(/<h2[^>]*>What I’d take from that<\/h2>/)
    expect(m).toMatch(/<span class="font-semibold">Reframe the category as explained, not assumed\.<\/span>/)
    expect(text(node)).toContain('Reasoning from claims 1, 4 above.')
    expect(render(<PlanJudgement claims={doc.claims} judgement={[]} />)).toBe('')
    expect(render(node)).not.toContain('Written')
    expect(leadSentence('One sentence only.')).toBeNull()
    expect(leadSentence('First one. Second one.')).toEqual({ lead: 'First one.', rest: 'Second one.' })
  })
})
