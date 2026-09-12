import { describe, expect, it } from 'vitest'
import { validateInsights, validateClaims, buildSystemPrompt, buildUserPrompt, passALane } from './pass-a'
import { usableTranscript } from './transcript-input'
import { PASS_A_VIDEO_QUOTE_MAX, TRANSCRIPT_PROMPT_CHARS } from '../config'
import type { PassAVideoOutput, PassAInsight } from './schemas'

// Pure-logic coverage for the Pass A v4 transcript seam: the "t" evidence
// label, the owner gate (industry-other only), the sentence-scale quote cap,
// brand-claim validation, and the status gate on transcript input.

const classification: PassAVideoOutput['classification'] = {
  classified_type: 'review',
  hook_style: 'question',
  hook_text: '',
  topics: [],
  sentiment: null,
}

const mkInsight = (evidence: { quote: string; comment_id: string }[]): PassAInsight => ({
  category: 'praise',
  theme: 'zipper_quality',
  description: 'd',
  evidence,
  strength_score: 5,
  emotion: 'joyful',
  sentiment_impact: 'positive',
  journey_stage: null,
})

const mkParsed = (insights: PassAInsight[]): PassAVideoOutput => ({
  classification,
  insights,
  language_samples: [],
})

const refs = [{ label: 'c1', realId: 'real-1', text: 'This strap fixed my shoulder pain' }]
const TRANSCRIPT = 'I have used this bag for a year and honestly the zipper broke in month two'

describe('validateInsights — transcript evidence (v4)', () => {
  it('keeps a verbatim "t" quote on an industry video as source video', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'the zipper broke', comment_id: 't' }])])
    const r = validateInsights(parsed, refs, { text: TRANSCRIPT, evidenceAllowed: true })
    expect(r.kept).toHaveLength(1)
    expect(r.kept[0].evidence[0]).toEqual({ realId: null, quote: 'the zipper broke', source: 'video' })
  })

  it('drops "t" evidence on client/competitor videos (evidenceAllowed false)', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'the zipper broke', comment_id: 't' }])])
    const r = validateInsights(parsed, refs, { text: TRANSCRIPT, evidenceAllowed: false })
    expect(r.kept).toHaveLength(0)
    expect(r.insightsDropped).toBe(1)
    expect(r.evidenceDropped).toBe(1)
  })

  it('drops "t" evidence when no transcript context exists (v3 calls)', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'the zipper broke', comment_id: 't' }])])
    const r = validateInsights(parsed, refs)
    expect(r.kept).toHaveLength(0)
  })

  it('drops a "t" quote that is not verbatim in the transcript', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'the zipper is excellent', comment_id: 't' }])])
    const r = validateInsights(parsed, refs, { text: TRANSCRIPT, evidenceAllowed: true })
    expect(r.kept).toHaveLength(0)
  })

  it('drops a "t" quote beyond sentence scale even when verbatim', () => {
    const long = 'a'.repeat(PASS_A_VIDEO_QUOTE_MAX + 1)
    const parsed = mkParsed([mkInsight([{ quote: long, comment_id: 't' }])])
    const r = validateInsights(parsed, refs, { text: `intro ${long} outro`, evidenceAllowed: true })
    expect(r.kept).toHaveLength(0)
    expect(r.evidenceDropped).toBe(1)
  })

  it('keeps comment evidence exactly as before, stamped source comment', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'fixed my shoulder pain', comment_id: 'c1' }])])
    const r = validateInsights(parsed, refs)
    expect(r.kept[0].evidence[0]).toEqual({ realId: 'real-1', quote: 'fixed my shoulder pain', source: 'comment' })
  })

  it('mixes comment and transcript evidence on one insight', () => {
    const parsed = mkParsed([
      mkInsight([
        { quote: 'fixed my shoulder pain', comment_id: 'c1' },
        { quote: 'the zipper broke', comment_id: 't' },
      ]),
    ])
    const r = validateInsights(parsed, refs, { text: TRANSCRIPT, evidenceAllowed: true })
    expect(r.kept[0].evidence.map((e) => e.source)).toEqual(['comment', 'video'])
  })
})

describe('validateClaims', () => {
  it('keeps claims whose quote is verbatim in the transcript', () => {
    const r = validateClaims([{ claim: 'Durability issues admitted', quote: 'the zipper broke in month two' }], TRANSCRIPT)
    expect(r).toEqual({ kept: [{ claim: 'Durability issues admitted', quote: 'the zipper broke in month two' }], dropped: 0 })
  })

  it('drops paraphrased quotes and claims without a transcript', () => {
    expect(validateClaims([{ claim: 'c', quote: 'zipper failed fast' }], TRANSCRIPT).dropped).toBe(1)
    expect(validateClaims([{ claim: 'c', quote: 'the zipper broke' }], null).dropped).toBe(1)
  })

  it('caps kept claims at 3', () => {
    const claims = ['used this bag', 'for a year', 'the zipper broke', 'month two'].map((q) => ({ claim: q, quote: q }))
    const r = validateClaims(claims, TRANSCRIPT)
    expect(r.kept).toHaveLength(3)
    expect(r.dropped).toBe(1)
  })
})

describe('buildSystemPrompt v4 line rewrites', () => {
  // The v4 rewrites are exact-string matches against the base prompt lines. If
  // a base line is ever edited, the rewrite silently stops applying and v4
  // reverts to the comments-only framing — the exact failure A/B round 1
  // measured (1 transcript citation across 33 industry videos). These pins
  // fail loudly instead.
  const tc = { brand_keywords: ['sealand'], competitor_names: [], industry_keywords: [] }

  it('v4 amends the comments-only framing and appends the transcript rules', () => {
    const v4 = buildSystemPrompt(tc, true)
    expect(v4).toContain('on industry/other videos — the video transcript')
    expect(v4).not.toContain('- Insights must come from the comments, not the metadata.')
    expect(v4).toContain('TRANSCRIPT rules')
  })

  it('v3 output keeps the original lines and no transcript section', () => {
    const v3 = buildSystemPrompt(tc, false)
    expect(v3).toContain('- Insights must come from the comments, not the metadata.')
    expect(v3).not.toContain('TRANSCRIPT')
  })
})

describe('the ORIGINAL stays the evidence (WP6 translation, 2026-09-11)', () => {
  const tc = { brand_keywords: ['sealand'], competitor_names: [], industry_keywords: [] }
  const v = {
    platform: 'tiktok', account_name: 'acc', caption: 'probando la mochila', hashtags: ['#mochila'],
    content_format: 'reel', transcript_lang: 'es', is_client: false, is_competitor: false,
  } as unknown as Parameters<typeof buildUserPrompt>[0]
  const refs = [{ label: 'c1', realId: 'id-1', text: 'me encanta' }]

  it('v4 tells the model to reason from the translation and quote only the original', () => {
    const p = buildSystemPrompt(tc, true)
    expect(p).toContain('ENGLISH TRANSLATION block is present')
    expect(p).toContain('comes ONLY from the ORIGINAL transcript, verbatim')
    // hook_text is named explicitly — it is a verbatim field that does not go
    // through validateInsights, so the prompt is the only thing holding it.
    expect(p).toContain('hook_text')
  })

  it('the sentence is inert on v3 (no transcripts at all)', () => {
    expect(buildSystemPrompt(tc, false)).not.toContain('ENGLISH TRANSLATION')
  })

  it('both blocks appear, labelled, original first', () => {
    const p = buildUserPrompt(v, refs, 'probé esta mochila', 'I tried this backpack')
    expect(p).toContain('TRANSCRIPT [t] (lang: es) — ORIGINAL, quote from this verbatim:')
    expect(p).toContain('probé esta mochila')
    expect(p).toContain('ENGLISH TRANSLATION (read this to understand; never quote from it):')
    expect(p).toContain('I tried this backpack')
    expect(p.indexOf('probé esta mochila')).toBeLessThan(p.indexOf('I tried this backpack'))
  })

  it('WITHOUT a translation the USER prompt is byte-identical to the pre-change build', () => {
    // Frozen output of buildUserPrompt as it stood at the merge base c7731b2,
    // captured by running that exact function body (git show
    // c7731b2:lib/pipeline/pass-a.ts) on this same video and refs. Comparing
    // the new builder against itself — which an earlier version of this test
    // did, since the 4th parameter defaults to null — pins the default, not the
    // pre-change output. This pins the output.
    //
    // NOTE the scope of the claim: the USER prompt is byte-identical. The
    // SYSTEM prompt is NOT — v4 gains one sentence about the ENGLISH
    // TRANSLATION block for every transcripts-enabled call, translated or not.
    // It is inert (it describes a block that is absent) but it is a change, and
    // 'pass_a_v4.1' therefore names two system prompts. See the comment at the
    // top of pass-a.ts for why that is the deliberate economic call.
    const PRE_CHANGE = 'VIDEO\n- platform: tiktok\n- account: acc\n- owner: an industry/other account\n- caption: probando la mochila\n- hashtags: #mochila\n- format: reel\n\nTRANSCRIPT [t] (lang: es)\nprobé esta mochila\n\nCOMMENTS (1)\n[c1] me encanta'
    expect(buildUserPrompt(v, refs, 'probé esta mochila', null)).toBe(PRE_CHANGE)
  })

  it('a translation alone adds nothing — no transcript, no blocks', () => {
    expect(buildUserPrompt(v, refs, null, 'I tried this backpack')).not.toContain('TRANSLATION')
  })
})

describe('buildSystemPrompt — demographic_signal is counted, not quoted (2026-08-22)', () => {
  const tc = { brand_keywords: ['ossur'], competitor_names: [], industry_keywords: [] }
  for (const withTranscripts of [false, true]) {
    it(`v${withTranscripts ? 4 : 3}: no "age" in the category, identity-disclosure rule present`, () => {
      const p = buildSystemPrompt(tc, withTranscripts)
      const catLine = p.split('\n').find((l) => l.startsWith('- demographic_signal:'))
      expect(catLine).toBeDefined()
      expect(catLine).not.toContain('— age,') // age is no longer an attribute the model extracts
      expect(catLine).toContain('(never age)')
      expect(catLine).toContain('COUNTED, never displayed')
      expect(p).toContain('must not reproduce a sentence whose point is the writer\'s own diagnosis, disability status, or that they are under 18')
    })
  }
})

describe('usableTranscript', () => {
  it('returns text only for status ok', () => {
    expect(usableTranscript({ transcript: 'real speech here', transcript_status: 'ok' })).toBe('real speech here')
    for (const status of ['lyrics', 'garbled', 'no_speech', 'no_media', 'failed', null, undefined]) {
      expect(usableTranscript({ transcript: 'real speech here', transcript_status: status as string | null })).toBeNull()
    }
    expect(usableTranscript({ transcript: null, transcript_status: 'ok' })).toBeNull()
  })

  it('clips to the prompt budget', () => {
    const long = 'word '.repeat(2000)
    const out = usableTranscript({ transcript: long, transcript_status: 'ok' })
    expect(out).not.toBeNull()
    expect((out as string).length).toBeLessThanOrEqual(TRANSCRIPT_PROMPT_CHARS)
  })
})

describe('passALane — the comment floor vs the Wave 4 claims lane', () => {
  const yt = (over: Partial<{ is_client: boolean; is_competitor: boolean; transcript_status: string | null }> = {}) => ({
    platform: 'youtube', is_client: false, is_competitor: false, transcript_status: null, ...over,
  })

  it('at or above the floor is the full lane, transcript or not', () => {
    expect(passALane(yt(), 5)).toBe('full')
    expect(passALane(yt({ is_client: true, transcript_status: 'ok' }), 12)).toBe('full')
  })

  it('a client video below the floor with a usable transcript enters the claims lane', () => {
    expect(passALane(yt({ is_client: true, transcript_status: 'ok' }), 0)).toBe('claims_only')
    expect(passALane(yt({ is_competitor: true, transcript_status: 'ok' }), 4)).toBe('claims_only')
  })

  it('an industry video below the floor is skipped even with a transcript — its voice is evidence, and evidence needs the floor', () => {
    expect(passALane(yt({ transcript_status: 'ok' }), 4)).toBe('skip')
  })

  it('a brand-side video below the floor without a USABLE transcript is skipped (lyrics/garbled/null never count)', () => {
    expect(passALane(yt({ is_client: true, transcript_status: 'lyrics' }), 2)).toBe('skip')
    expect(passALane(yt({ is_client: true, transcript_status: null }), 2)).toBe('skip')
  })

  it('respects the per-platform floor (Reddit 3) and an explicit override', () => {
    expect(passALane({ ...yt(), platform: 'reddit' }, 3)).toBe('full')
    expect(passALane(yt(), 3)).toBe('skip')
    expect(passALane(yt(), 3, 3)).toBe('full')
  })

  it('is disabled by passing transcript_status null when transcripts are off', () => {
    expect(passALane(yt({ is_client: true, transcript_status: null }), 0)).toBe('skip')
  })

  it("the client's OWN posts take the claims lane or nothing — never the full lane, however many comments", () => {
    const owned = { ...yt({ is_client: true, transcript_status: 'ok' }), source: 'owned' }
    expect(passALane(owned, 57)).toBe('claims_only')
    expect(passALane(owned, 0)).toBe('claims_only')
    expect(passALane({ ...owned, transcript_status: 'lyrics' }, 57)).toBe('skip')
    expect(passALane({ ...owned, transcript_status: null }, 57)).toBe('skip')
  })

  it("a COMPETITOR's own posts take the same lane — their fans' comments are not our audience either", () => {
    const theirs = { ...yt({ is_competitor: true, transcript_status: 'ok' }), source: 'competitor_owned' }
    expect(passALane(theirs, 200)).toBe('claims_only')
    expect(passALane({ ...theirs, transcript_status: 'no_media' }, 200)).toBe('skip')
  })
})
