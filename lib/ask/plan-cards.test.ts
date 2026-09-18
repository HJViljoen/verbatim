import { describe, it, expect } from 'vitest'

import {
  PLAN_CLAIM_BASIS, PLAN_FLOOR_LINE, PLAN_VERDICT_FLOOR, PLAN_VERDICT_LABEL,
  movedSinceUpload, planCard, type PlanEvaluation,
} from './plan-cards'
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

  it('stands at exactly the floor this card prints', () => {
    const quoted = new Set(['i1'].slice(0, PLAN_VERDICT_FLOOR))
    expect(quoted.size).toBe(PLAN_VERDICT_FLOOR)
    const out = validateVerdicts(raw, asked, themes, {
      liveInsightIds: new Set(['i1']),
      quotedInsightIds: quoted,
      videoByInsightId: new Map([['i1', 'v1']]),
    })
    expect(out[0].verdict).toBe('echoes')
  })

  it('never prints the mock’s five', () => {
    expect(PLAN_FLOOR_LINE).not.toMatch(/\b5\b/)
    expect(PLAN_FLOOR_LINE).toContain('1 real comment')
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

  it('gives every claim count its denominator and names the basis', () => {
    const card = planCard({ ...base, claims: [claim('C1', 'echoes', 14, ['i1'])], summary: null })
    expect(card.claims[0].value).toEqual({ k: 14, n: 2359 })
    expect(card.basis).toBe(PLAN_CLAIM_BASIS)
    expect(card.basis).toContain('not over one month')
  })

  it('keeps k as its own n rather than inventing one when the corpus is unreadable', () => {
    const card = planCard({ ...base, corpusVideos: null, claims: [claim('C1', 'echoes', 14)], summary: null })
    expect(card.claims[0].value).toEqual({ k: 14, n: 14 })
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
    expect(card.caveat).toMatch(/can move back/)
    expect(card.notice).toBe('Only the earlier part was read.')
  })

  it('says so when a document yielded no checkable claim', () => {
    expect(planCard({ ...base, claims: [], summary: null }).empty).toMatch(/could be read as a claim/)
  })
})
