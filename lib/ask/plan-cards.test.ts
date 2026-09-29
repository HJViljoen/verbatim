import { describe, it, expect } from 'vitest'

import {
  PLAN_CLAIM_BASIS, PLAN_CLAIM_BASIS_UNCOUNTED, PLAN_FLOOR_LINE, PLAN_VERDICT_FLOOR, PLAN_VERDICT_LABEL,
  PLAN_QUOTE_CANDIDATES, currentReading, movedSinceUpload, planCard, planQuotePicker, type PlanEvaluation,
} from './plan-cards'
import type { QuoteContext } from '../quote-context'
import type { QuoteVideo } from '../quote-gate'
import { createCitedQuotePicker, type QuoteRow } from '../quotes'
import type { ClaimResult } from './types'
import { validateVerdicts, type AskTheme } from './verdicts'

const claim = (ref: string, verdict: ClaimResult['verdict'], count: number, insightIds: string[] = []): ClaimResult => ({
  ref,
  claim: `claim ${ref}`,
  verdict,
  theySay: verdict === 'silent' ? null : 'the conversation says something',
  conversationCount: count,
  themeRefs: [],
  insightIds,
  source: null,
})

describe('the verdict floor is the engine’s, not a number typed in a footer', () => {
  // The mock says "verdict floor 5 videos per claim" and nothing in the engine
  // holds a 5. This asserts the constant against `validateVerdicts` itself: at
  // zero quotable comments a claim falls to silent, at PLAN_VERDICT_FLOOR it
  // stands. If somebody raises the real floor, this fails before the footer
  // starts lying.
  const theme: AskTheme = {
    themeId: 't1', registryId: 'r1', label: 'Durability', description: 'wear',
    bucket: 'client', insightIds: ['i1'], videoIds: ['v1'], embedding: null,
  }
  const themes = new Map([['c1', [theme]]])
  const asked = [{ ref: 'C1', claim: 'Our bags last a decade' }]
  const raw = [{ claim_ref: 'C1', verdict: 'echoes', they_say: 'people say so', theme_refs: ['T1'] }]

  it('falls to untested with nothing quotable behind it', () => {
    const out = validateVerdicts(raw, asked, themes, {
      liveInsightIds: new Set(['i1']),
      quotedInsightIds: new Set<string>(),
      videoByInsightId: new Map(),
    })
    expect(out[0].verdict).toBe('silent')
  })

  // THE FLOOR IS VIDEOS WITH A QUOTABLE COMMENT (walkthrough item 5): the
  // validator is run either side of `PLAN_VERDICT_FLOOR`, so the line the card
  // prints is the rule the engine holds.
  const atFloor = (videos: number) => {
    const ids = Array.from({ length: Math.max(videos, 1) }, (_, i) => `i${i}`)
    const t: AskTheme = { ...theme, insightIds: ids, videoIds: ids.map((_, i) => `v${i}`) }
    return validateVerdicts(raw, asked, new Map([['c1', [t]]]), {
      liveInsightIds: new Set(ids),
      quotedInsightIds: new Set(ids),
      videoByInsightId: new Map(ids.slice(0, videos).map((id, i) => [id, `v${i}`])),
    })[0].verdict
  }

  it('stands at exactly the floor this card prints, and not one below it', () => {
    expect(atFloor(PLAN_VERDICT_FLOOR)).toBe('echoes')
    expect(atFloor(PLAN_VERDICT_FLOOR - 1)).toBe('silent')
  })

  it('prints the engine’s floor, in videos', () => {
    expect(PLAN_FLOOR_LINE).toContain(`${PLAN_VERDICT_FLOOR} video`)
    expect(PLAN_FLOOR_LINE).toContain('real comment')
  })
})

describe('movedSinceUpload', () => {
  const ev = (createdAt: string, runDate: string, moved: PlanEvaluation['moved']): PlanEvaluation => ({ createdAt, runDate, moved })

  it('keeps the LAST transition per claim and counts the readings since', () => {
    const out = movedSinceUpload([
      ev('2026-08-19T00:00:00Z', '2026-08-19', [{ ref: 'C1', claim: 'buyer is a recent amputee', from: 'contradicts', to: 'silent' }]),
      ev('2026-08-30T00:00:00Z', '2026-08-30', []),
      ev('2026-09-06T00:00:00Z', '2026-09-06', [{ ref: 'C1', claim: 'buyer is a recent amputee', from: 'silent', to: 'contradicts' }]),
      ev('2026-09-13T00:00:00Z', '2026-09-13', []),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].from).toBe('Untested')
    expect(out[0].to).toBe('Contradicted')
    // Moved at the third of four readings, so two have carried it.
    expect(out[0].on).toContain('6 Sep')
    expect(out[0].on).toContain('2 readings have carried it since')
  })

  it('says ONE reading when the move is the newest one — never "held 2 updates"', () => {
    const out = movedSinceUpload([
      ev('2026-09-06T00:00:00Z', '2026-09-06', []),
      ev('2026-09-13T00:00:00Z', '2026-09-13', [{ ref: 'C2', claim: 'recycled story drives sharing', from: 'silent', to: 'echoes' }]),
    ])
    expect(out[0].on).toContain('1 reading has carried it since')
    expect(out[0].on).not.toMatch(/update/i)
    expect(out[0].on).not.toMatch(/held/i)
  })

  it('reads a claim that flipped back as its most recent move', () => {
    // Össur's C1, measured on production: contradicts → silent → contradicts →
    // silent over four consecutive re-readings.
    const out = movedSinceUpload([
      ev('2026-08-19T00:00:00Z', '2026-08-19', [{ ref: 'C1', claim: 'c', from: 'contradicts', to: 'silent' }]),
      ev('2026-08-30T00:00:00Z', '2026-08-30', []),
      ev('2026-09-06T00:00:00Z', '2026-09-06', [{ ref: 'C1', claim: 'c', from: 'silent', to: 'contradicts' }]),
      ev('2026-09-13T00:00:00Z', '2026-09-13', [{ ref: 'C1', claim: 'c', from: 'contradicts', to: 'silent' }]),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].to).toBe('Untested')
    expect(out[0].on).toContain('1 reading has carried it since')
  })

  it('is empty when nothing has moved', () => {
    expect(movedSinceUpload([ev('2026-09-13T00:00:00Z', '2026-09-13', [])])).toEqual([])
    expect(movedSinceUpload([])).toEqual([])
  })

  it('takes evaluations in any order', () => {
    const out = movedSinceUpload([
      ev('2026-09-13T00:00:00Z', '2026-09-13', []),
      ev('2026-09-06T00:00:00Z', '2026-09-06', [{ ref: 'C1', claim: 'c', from: 'silent', to: 'echoes' }]),
    ])
    expect(out[0].on).toContain('6 Sep')
    expect(out[0].on).toContain('2 readings')
  })
})

describe('currentReading — the card prints the newest re-reading, not the upload', () => {
  const ev = (createdAt: string, runDate: string, claims: ClaimResult[] | null, summary: PlanEvaluation['summary'] = null): PlanEvaluation =>
    ({ createdAt, runDate, moved: [], claims, summary })

  it('takes the newest evaluation’s claims over the stored ones', () => {
    const stored = [claim('C1', 'contradicts', 41)]
    const out = currentReading(stored, { supported: 0, contradicted: 1, untested: 0 }, [
      ev('2026-09-06T02:00:00Z', '2026-09-06', [claim('C1', 'contradicts', 38)]),
      ev('2026-09-13T02:00:00Z', '2026-09-13', [claim('C1', 'silent', 0)], { supported: 0, contradicted: 0, untested: 1 }),
    ])
    expect(out.claims[0].verdict).toBe('silent')
    expect(out.summary).toEqual({ supported: 0, contradicted: 0, untested: 1 })
    expect(out.checkedOn).toBe('2026-09-13')
  })

  it('falls back to the check’s own answer where nothing has re-read it', () => {
    const stored = [claim('C1', 'echoes', 9)]
    const summary = { supported: 1, contradicted: 0, untested: 0 }
    const out = currentReading(stored, summary, [])
    expect(out.claims).toEqual(stored)
    expect(out.summary).toBe(summary)
    expect(out.checkedOn).toBeNull()
  })

  it('skips an evaluation that stored no claims, in any order', () => {
    const out = currentReading([claim('C1', 'echoes', 9)], null, [
      ev('2026-09-13T02:00:00Z', '2026-09-13', null),
      ev('2026-09-06T02:00:00Z', '2026-09-06', [claim('C1', 'contradicts', 3)]),
    ])
    expect(out.claims[0].verdict).toBe('contradicts')
    expect(out.checkedOn).toBe('2026-09-06')
  })

  it('never carries the upload’s summary onto a later reading’s claims', () => {
    const out = currentReading([claim('C1', 'echoes', 9)], { supported: 1, contradicted: 0, untested: 0 }, [
      ev('2026-09-13T02:00:00Z', '2026-09-13', [claim('C1', 'silent', 0)]),
    ])
    expect(out.summary).toBeNull()
    // planCard derives it from the claims it is printing instead.
    expect(planCard({
      planId: 'p1', title: null, sourceFilename: null, uploadedOn: '2026-08-20T09:00:00Z', notice: null,
      corpusVideos: 100, href: '/x',
      claims: [claim('C1', 'echoes', 9)],
      summary: { supported: 1, contradicted: 0, untested: 0 },
      evaluations: [ev('2026-09-13T02:00:00Z', '2026-09-13', [claim('C1', 'silent', 0)])],
    }).summary).toEqual({ supported: 0, contradicted: 0, untested: 1 })
  })
})

describe('planCard', () => {
  const base = {
    planId: 'p1',
    title: 'Summer 2026/27 campaign brief',
    sourceFilename: 'summer-brief.pdf',
    uploadedOn: '2026-08-20T09:00:00Z',
    notice: null,
    evaluations: [] as PlanEvaluation[],
    corpusVideos: 2359,
    href: '/dashboard/agent/t1',
  }

  it('gives every claim count its denominator and names the basis, floor and all', () => {
    const card = planCard({ ...base, claims: [claim('C1', 'echoes', 14, ['i1'])], summary: null })
    expect(card.claims[0].value).toEqual({ k: 14, n: 2359 })
    expect(card.basis).toBe(PLAN_CLAIM_BASIS)
    expect(card.basis).toContain('not out of one month')
    // The numerator is bounded by what the agent retrieved for the claim, not
    // by the conversation, so the share is a floor and the basis says so —
    // D8's rule, the one `groundingFor` keeps two files over.
    expect(card.basis).toContain('floor')
  })

  it('carries NO denominator rather than an invented one when the corpus is unreadable', () => {
    const card = planCard({ ...base, corpusVideos: null, claims: [claim('C1', 'echoes', 14)], summary: null })
    // Never { k: 14, n: 14 }: a failed head count printed as "14 of 14" is a
    // 100% share of everything read, which is worse than the bare count.
    expect(card.claims[0].value).toEqual({ k: 14, n: 0 })
    expect(card.basis).toBe(PLAN_CLAIM_BASIS_UNCOUNTED)
    expect(card.basis).toContain('without its share')
  })

  it('uses the three words Ask and the mock both use', () => {
    const card = planCard({
      ...base,
      claims: [claim('C1', 'echoes', 9), claim('C2', 'contradicts', 5), claim('C3', 'silent', 0)],
      summary: null,
    })
    expect(card.claims.map((c) => c.verdictLabel)).toEqual(['Supported', 'Contradicted', 'Untested'])
    expect(PLAN_VERDICT_LABEL.silent).toBe('Untested')
  })

  it('counts its own summary when none was stored, and keeps the stored one when there is', () => {
    const claims = [claim('C1', 'echoes', 9), claim('C2', 'contradicts', 5), claim('C3', 'silent', 0)]
    expect(planCard({ ...base, claims, summary: null }).summary).toEqual({ supported: 1, contradicted: 1, untested: 1 })
    const stored = { supported: 6, contradicted: 1, untested: 2 }
    expect(planCard({ ...base, claims, summary: stored }).summary).toBe(stored)
  })

  it('shows no quote on an untested claim', () => {
    const card = planCard({
      ...base,
      claims: [claim('C1', 'silent', 0, ['i1']), claim('C2', 'contradicts', 3, ['i2'])],
      summary: null,
      quoteFor: (c) => ({ ref: `e:${c.ref}`, text: 'they said this' }),
    })
    expect(card.claims[0].quote).toBeNull()
    expect(card.claims[1].quote).toEqual({ ref: 'e:C2', text: 'they said this' })
  })

  it('leads with the document’s own filename, then a title, then an honest fallback', () => {
    expect(planCard({ ...base, claims: [], summary: null }).title).toBe('summer-brief.pdf')
    expect(planCard({ ...base, sourceFilename: null, claims: [], summary: null }).title).toBe('Summer 2026/27 campaign brief')
    expect(planCard({ ...base, sourceFilename: null, title: null, claims: [], summary: null }).title).toBe('An uploaded plan')
  })

  it('carries the floor, the hold caveat and the clipping notice', () => {
    const card = planCard({ ...base, notice: 'Only the earlier part was read.', claims: [claim('C1', 'echoes', 1)], summary: null })
    expect(card.floorLine).toBe(PLAN_FLOOR_LINE)
    expect(card.caveat).toMatch(/changes only when the evidence behind it does/)
    expect(card.notice).toBe('Only the earlier part was read.')
  })

  it('says so when a document yielded no checkable claim', () => {
    expect(planCard({ ...base, claims: [], summary: null }).empty).toMatch(/could be read as a claim/)
  })

  it('prints the re-read verdict and the date it was read, never the upload’s chip', () => {
    // Össur's C1: contradicted at upload, untested on the newest reading. A
    // card printing "Contradicted" beside a `moved` row saying it changed on
    // 13 Sep is the page disagreeing with itself.
    const card = planCard({
      ...base,
      claims: [claim('C1', 'contradicts', 41, ['i1'])],
      summary: { supported: 0, contradicted: 1, untested: 0 },
      evaluations: [{
        createdAt: '2026-09-13T02:00:00Z',
        runDate: '2026-09-13',
        moved: [{ ref: 'C1', claim: 'claim C1', from: 'contradicts', to: 'silent' }],
        claims: [claim('C1', 'silent', 0, ['i1'])],
        summary: { supported: 0, contradicted: 0, untested: 1 },
      }],
    })
    expect(card.claims[0].verdictLabel).toBe('Untested')
    expect(card.summary).toEqual({ supported: 0, contradicted: 0, untested: 1 })
    expect(card.checkedOn).toBe('2026-09-13')
    expect(card.moved[0].to).toBe('Untested')
  })

  it('says nothing has re-read the document by leaving checkedOn null', () => {
    expect(planCard({ ...base, claims: [claim('C1', 'echoes', 9)], summary: null }).checkedOn).toBeNull()
  })
})

// The plan cards' quotes go through the quote gate, as the old Market page's
// do (walkthrough, 29 Sep): a deeper pick, then the gate.
describe('planQuotePicker — a plan claim’s quote passes the quote gate', () => {
  const CLIENT = '00000000-0000-4000-8000-000000000001'
  const market: QuoteVideo = { platform: 'tiktok', videoId: 'v-market', accountName: 'someone', caption: 'my trip', source: 'discovered', isClient: false, isCompetitor: false }
  const row = (evidenceId: string, quote: string, rank: number): QuoteRow => ({ quote, rank, evidenceId })
  const ctxOf = (videos: Record<string, QuoteVideo | null>): QuoteContext => ({
    forEvidence: (id) => (id ? videos[id] ?? null : null),
    forComment: () => null,
    forVideo: () => null,
    forVideoUuid: () => null,
    commentOfEvidence: () => null,
  })
  const withQuote = (ref: string) => ({ ...claim(ref, 'echoes', 9, ['i1']), claim: `claim ${ref} about the bag lasting` })

  it('skips a quote the gate refuses and prints the next that passes', () => {
    const byAudience = new Map([['i1', [
      row('ev-brand', 'My bag has been lasting through three years of daily commuting now', 1),
      row('ev-market', 'Mine is lasting well too, the bag still looks new after a year', 2),
    ]]])
    const videos = {
      // A competitor's own post: never the market's word (the gate's brand_post).
      'ev-brand': { ...market, videoId: 'v-brand', source: 'competitor_owned', isCompetitor: true, competitorName: 'Rival' },
      'ev-market': market,
    }
    // Ungated, the picker's first choice is the brand's post.
    expect(createCitedQuotePicker(byAudience, new Map())(['i1'], 1, `${withQuote('C1').claim}. the conversation says something`)[0]?.ref).toBe('e:ev-brand')
    expect(planQuotePicker(byAudience, ctxOf(videos), CLIENT)(withQuote('C1'))?.ref).toBe('e:ev-market')
  })

  it('prints no quote where the video behind it cannot be placed, or the context was not read', () => {
    const byAudience = new Map([['i1', [row('ev-1', 'My bag has been lasting through three years of daily commuting now', 1)]]])
    expect(planQuotePicker(byAudience, ctxOf({}), CLIENT)(withQuote('C1'))).toBeNull()
    expect(planQuotePicker(byAudience, null, CLIENT)(withQuote('C1'))).toBeNull()
  })

  it('never prints one voice twice across claims, and a claim’s unprinted candidates stay for the next', () => {
    const rows = Array.from({ length: PLAN_QUOTE_CANDIDATES }, (_, i) =>
      row(`ev-${i}`, `My bag has been lasting through ${i + 2} years of daily commuting now`, i + 1))
    const videos = Object.fromEntries(rows.map((r, i) => [r.evidenceId, { ...market, videoId: `v-${i}` }]))
    const pick = planQuotePicker(new Map([['i1', rows]]), ctxOf(videos), CLIENT)
    const first = pick(withQuote('C1'))
    const second = pick(withQuote('C2'))
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second?.text).not.toBe(first?.text)
  })
})
