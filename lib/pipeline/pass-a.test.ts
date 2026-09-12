import { describe, expect, it } from 'vitest'
import { validateInsights, validateClaims, buildSystemPrompt, buildUserPrompt, passALane, isVideoEvidence, missingBookkeepingColumn } from './pass-a'
import { usableOcr, usableTranscript } from './transcript-input'
import { OCR_PROMPT_CHARS, PASS_A_VIDEO_QUOTE_MAX, TRANSCRIPT_PROMPT_CHARS } from '../config'
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

describe('on-screen text from the cover frame (WP7b, 2026-09-12)', () => {
  const tc = { brand_keywords: ['sealand'], competitor_names: [], industry_keywords: [] }
  const v = {
    platform: 'tiktok', account_name: 'acc', caption: 'day 3', hashtags: ['#blade'],
    content_format: 'reel', transcript_lang: 'en', is_client: false, is_competitor: false,
  } as unknown as Parameters<typeof buildUserPrompt>[0]
  const refs = [{ label: 'c1', realId: 'id-1', text: 'looks great' }]
  const OCR = 'I TRIED 6 PROSTHETIC LEGS\nthis one actually fit'

  it('the v4 prompt says what the block is, and that it is one frame', () => {
    const p = buildSystemPrompt(tc, true, true)
    expect(p).toContain('ON-SCREEN TEXT rules')
    expect(p).toContain("the words printed on the video's COVER FRAME")
    expect(p).toContain('the hook is very often TYPED on screen and never said out loud')
    // The two guards against the failure mode this feature could introduce.
    expect(p).toContain('It is ONE FRAME, not the whole video')
    expect(p).toContain('Never merge two lines of the block into one quote')
  })

  it('brand videos may never cite it — the transcript rule, unchanged', () => {
    expect(buildSystemPrompt(tc, true, true)).toContain('CLIENT or COMPETITOR videos: this is brand messaging. Never cite "o" on these.')
  })

  it('the rules are inert on v3 (no video-evidence machinery at all)', () => {
    expect(buildSystemPrompt(tc, false, true)).not.toContain('ON-SCREEN TEXT')
  })

  it('WITHOUT on-screen text the SYSTEM prompt is byte-identical to v4 as it stood', () => {
    // The pair to the user-prompt fixture below. Together they make "the prompt
    // version is deliberately not bumped" a demonstrated fact rather than a
    // judgement: a video whose cover carried no text — most of the corpus, and
    // all of it before the first OCR wave — receives the bytes it would have
    // received without WP7b at all. It also means such a call does not carry
    // ~150 tokens of rules about an absent block.
    //
    // Scope of the claim, stated exactly (it was overstated here before): the
    // USER prompt is byte-identical to what 'pass_a_v4.1' has always meant; the
    // SYSTEM prompt is byte-identical to v4.1-AS-OF-WP6, which already gained
    // one inert sentence about the ENGLISH TRANSLATION block. See the comment at
    // the top of pass-a.ts: 'pass_a_v4.1' names two system prompts, and WP7b
    // adds no third.
    //
    // PRE_OCR_SYSTEM (bottom of this file) is a FROZEN literal. This test used
    // to read `toBe(buildSystemPrompt(tc, true))`, which is a tautology —
    // withOcr defaults to false — so it pinned the default parameter, not the
    // output, the very mistake the WP6 fixture's comment warns about twelve
    // lines up. A frozen literal fails on any edit to v4Lines, on purpose:
    // that edit changes the prompt for EVERY transcripts-enabled call and owes
    // a prompt-version decision.
    expect(buildSystemPrompt(tc, true, false)).toBe(PRE_OCR_SYSTEM)
    expect(buildSystemPrompt(tc, true)).toBe(PRE_OCR_SYSTEM)
    expect(buildSystemPrompt(tc, true, false)).not.toContain('ON-SCREEN TEXT')
    // …and the OCR variant is strictly the same prompt plus the block.
    expect(buildSystemPrompt(tc, true, true).startsWith(PRE_OCR_SYSTEM)).toBe(true)
  })

  it('tells the model a watermark or handle is never the hook and never evidence', () => {
    expect(buildSystemPrompt(tc, true, true))
      .toContain('Watermarks, platform UI, channel names and @handles are not the hook and are not evidence')
  })

  it('the block is labelled [o], says "cover frame", and sits ABOVE the transcript', () => {
    const p = buildUserPrompt(v, refs, 'so I tried six legs', null, OCR)
    expect(p).toContain('ON-SCREEN TEXT [o] (cover frame) — quote from this verbatim, one line per text block:')
    expect(p).toContain(OCR)
    expect(p.indexOf('ON-SCREEN TEXT [o]')).toBeLessThan(p.indexOf('TRANSCRIPT [t]'))
  })

  it('needs no transcript — a silent title-card video is the case it exists for', () => {
    const p = buildUserPrompt(v, refs, null, null, OCR)
    expect(p).toContain('ON-SCREEN TEXT [o]')
    expect(p).not.toContain('TRANSCRIPT [t]')
  })

  it('WITHOUT on-screen text the USER prompt is byte-identical to the pre-change build', () => {
    // Same claim, same scope as the WP6 test above: the USER prompt does not
    // move for a video whose cover carried no text — which is most of the
    // corpus and all of it before the first OCR wave — so there is nothing to
    // re-read and the prompt version is deliberately not bumped.
    const PRE_CHANGE = 'VIDEO\n- platform: tiktok\n- account: acc\n- owner: an industry/other account\n- caption: day 3\n- hashtags: #blade\n- format: reel\n\nTRANSCRIPT [t] (lang: en)\nso I tried six legs\n\nCOMMENTS (1)\n[c1] looks great'
    expect(buildUserPrompt(v, refs, 'so I tried six legs', null, null)).toBe(PRE_CHANGE)
    expect(buildUserPrompt(v, refs, 'so I tried six legs')).toBe(PRE_CHANGE)
  })

  it('all three blocks coexist in order: on-screen text, original, translation', () => {
    const p = buildUserPrompt(v, refs, 'probé', 'I tried', OCR)
    expect(p.indexOf('ON-SCREEN TEXT [o]')).toBeLessThan(p.indexOf('TRANSCRIPT [t]'))
    expect(p.indexOf('TRANSCRIPT [t]')).toBeLessThan(p.indexOf('ENGLISH TRANSLATION'))
  })
})

describe('validateInsights — "o" evidence (WP7b)', () => {
  const OCR = 'I TRIED 6 PROSTHETIC LEGS\nthis one actually fit'
  const ocrCtx = { text: OCR, evidenceAllowed: true }

  it('keeps a verbatim "o" quote on an industry video, stored as source video', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'this one actually fit', comment_id: 'o' }])])
    const r = validateInsights(parsed, refs, undefined, ocrCtx)
    expect(r.kept).toHaveLength(1)
    // NOT the transcript's 'video' (WP7b B1): WP7a reads that value as "said on
    // camera" and weighs it — it labels the quote in the Pass B brief, counts it
    // into themes.video_evidence_count, and renders "N said on camera" on a
    // client tile. Nobody SAID a title card, so typed text gets its own value
    // and earns neither.
    expect(r.kept[0].evidence[0]).toEqual({ realId: null, quote: 'this one actually fit', source: 'video_text' })
  })

  it('drops "o" on client/competitor videos — a typed hook is brand messaging', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'this one actually fit', comment_id: 'o' }])])
    const r = validateInsights(parsed, refs, undefined, { text: OCR, evidenceAllowed: false })
    expect(r.kept).toHaveLength(0)
    expect(r.evidenceDropped).toBe(1)
  })

  it('drops "o" when no on-screen text was shown (every call before this shipped)', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'this one actually fit', comment_id: 'o' }])])
    expect(validateInsights(parsed, refs).kept).toHaveLength(0)
    expect(validateInsights(parsed, refs, { text: 'a transcript', evidenceAllowed: true }).kept).toHaveLength(0)
  })

  it('drops a DESCRIPTION of the frame — the failure mode this feature could add', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'a woman holding a prosthetic leg', comment_id: 'o' }])])
    expect(validateInsights(parsed, refs, undefined, ocrCtx).kept).toHaveLength(0)
  })

  it('drops a quote welded from two separate lines of the frame', () => {
    // Nobody wrote this sentence: it is two text blocks that happened to share
    // a frame. normForMatch collapses newlines like any other whitespace, so
    // matching against the joined block would have accepted it — the validator
    // matches each quote against a SINGLE line for exactly this reason.
    const parsed = mkParsed([mkInsight([{ quote: 'I TRIED 6 PROSTHETIC LEGS this one actually fit', comment_id: 'o' }])])
    const r = validateInsights(parsed, refs, undefined, ocrCtx)
    expect(r.kept).toHaveLength(0)
  })

  it('drops a bare one-word fragment — a logo is not a finding (M2)', () => {
    // "RB" off an illegible chest logo is the measured case. The validator
    // cannot tell a misread from a read (it matches the model's own output), so
    // a fragment must not be allowed to become evidence at all.
    const parsed = mkParsed([mkInsight([{ quote: 'RAREFORM', comment_id: 'o' }])])
    expect(validateInsights(parsed, refs, undefined, { text: 'RAREFORM', evidenceAllowed: true }).kept).toHaveLength(0)
  })

  it('keeps a short quote that is more than one word', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'I GOT ALL', comment_id: 'o' }])])
    expect(validateInsights(parsed, refs, undefined, { text: 'I GOT ALL', evidenceAllowed: true }).kept).toHaveLength(1)
  })

  it('keeps a long single word — the bar is "a fragment", not "one token"', () => {
    const parsed = mkParsed([mkInsight([{ quote: 'unputdownable-quality', comment_id: 'o' }])])
    expect(validateInsights(parsed, refs, undefined, { text: 'unputdownable-quality', evidenceAllowed: true }).kept).toHaveLength(1)
  })

  it('drops an over-long "o" quote at the same sentence-scale cap as "t"', () => {
    const long = 'x'.repeat(PASS_A_VIDEO_QUOTE_MAX + 1)
    const parsed = mkParsed([mkInsight([{ quote: long, comment_id: 'o' }])])
    expect(validateInsights(parsed, refs, undefined, { text: long, evidenceAllowed: true }).kept).toHaveLength(0)
  })

  it('a typed line never reads as "said on camera" — WP7a keys on source === video', () => {
    const parsed = mkParsed([mkInsight([
      { quote: 'the zipper broke', comment_id: 't' },
      { quote: 'this one actually fit', comment_id: 'o' },
    ])])
    const r = validateInsights(parsed, refs, { text: TRANSCRIPT, evidenceAllowed: true }, ocrCtx)
    const sources = r.kept[0].evidence.map((e) => e.source)
    expect(sources).toEqual(['video', 'video_text'])
    // The two are disjoint by VALUE, so WP7a's `.eq('source','video')` and
    // `row.source === 'video'` keep their exact meaning across the merge.
    expect(sources.filter((x) => x === 'video')).toHaveLength(1)
    // Both are still "a video, not a comment" — which is what everything that
    // resolves a `v:` quote ref keys on.
    expect(r.kept[0].evidence.every((e) => isVideoEvidence(e.source))).toBe(true)
    expect(r.kept[0].evidence.every((e) => e.realId === null)).toBe(true)
  })

  it('"t" and "o" validate independently against their own blocks', () => {
    const parsed = mkParsed([mkInsight([
      { quote: 'the zipper broke', comment_id: 't' },
      { quote: 'this one actually fit', comment_id: 'o' },
    ])])
    const r = validateInsights(parsed, refs, { text: TRANSCRIPT, evidenceAllowed: true }, ocrCtx)
    expect(r.kept[0].evidence).toHaveLength(2)
    // Crossed over, each fails: a transcript quote is not in the cover text.
    const crossed = mkParsed([mkInsight([{ quote: 'the zipper broke', comment_id: 'o' }])])
    expect(validateInsights(crossed, refs, { text: TRANSCRIPT, evidenceAllowed: true }, ocrCtx).kept).toHaveLength(0)
  })
})

describe('usableOcr', () => {
  it('returns text only for status ok — "none" is an answer, not text', () => {
    expect(usableOcr({ ocr_text: 'BUY NOW', ocr_status: 'ok' })).toBe('BUY NOW')
    for (const status of ['none', 'no_image', 'failed', null, undefined]) {
      expect(usableOcr({ ocr_text: 'BUY NOW', ocr_status: status as string | null })).toBeNull()
    }
    expect(usableOcr({ ocr_text: null, ocr_status: 'ok' })).toBeNull()
    expect(usableOcr({ ocr_text: '   ', ocr_status: 'ok' })).toBeNull()
  })

  it('keeps the newlines — they separate text blocks, and the validator relies on it', () => {
    expect(usableOcr({ ocr_text: 'LINE ONE\nline two', ocr_status: 'ok' })).toBe('LINE ONE\nline two')
  })

  it('clips to the prompt budget', () => {
    const out = usableOcr({ ocr_text: 'word '.repeat(500), ocr_status: 'ok' })
    expect(out).not.toBeNull()
    expect([...(out as string)].length).toBeLessThanOrEqual(OCR_PROMPT_CHARS)
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

describe('missingBookkeepingColumn — the bookkeeping seatbelt is generic, not per-column', () => {
  const pgrst = (column: string) => ({ code: '42703', message: `column "${column}" of relation "videos" does not exist` })

  it('names either optional flag, so a deploy that lands before either migration still moves the pointer', () => {
    expect(missingBookkeepingColumn(pgrst('analyzed_with_ocr'))?.column).toBe('analyzed_with_ocr')
    expect(missingBookkeepingColumn(pgrst('analyzed_with_translation'))?.column).toBe('analyzed_with_translation')
  })

  it('points at the migration to apply', () => {
    expect(missingBookkeepingColumn(pgrst('analyzed_with_translation'))?.migration).toBe('20260911141000_transcript_en.sql')
    expect(missingBookkeepingColumn(pgrst('analyzed_with_ocr'))?.migration).toBe('20260912100000_ocr_text.sql')
  })

  it('reads a schema-cache miss (PGRST204) the same way', () => {
    expect(missingBookkeepingColumn({ code: 'PGRST204', message: "Could not find the 'analyzed_with_translation' column of 'videos' in the schema cache" })?.column)
      .toBe('analyzed_with_translation')
  })

  it('does not swallow a real write failure — only these two columns, only 42703/PGRST204', () => {
    expect(missingBookkeepingColumn(pgrst('analyzed_lane'))).toBeNull()
    expect(missingBookkeepingColumn({ code: '23514', message: 'new row violates check constraint "videos_analyzed_lane_check"' })).toBeNull()
    expect(missingBookkeepingColumn({ message: 'analyzed_with_ocr' })).toBeNull()
    expect(missingBookkeepingColumn(null)).toBeNull()
  })
})

// The Pass A v4 SYSTEM prompt with no on-screen-text block, frozen byte for
// byte as it stands at WP7b (2026-09-12) for the tc above — brand_keywords
// ['sealand'], no competitors, no industry keywords. Captured by running
// buildSystemPrompt(tc, true, false) once and pasting the output, exactly as
// the two user-prompt fixtures were.
//
// It is deliberately NOT a second call to the builder: comparing the builder
// against itself pins the default parameter, not the bytes. This is the
// regression guard for 'pass_a_v4.1' on the system side — edit v4Lines and
// this test fails, which is the moment to decide whether the version bumps.
const PRE_OCR_SYSTEM = `You are a media-based consumer intelligence analyst working for a brand.

Given ONE social video, its transcript when present, and its comments, return:
1. A classification of the video (type, hook style, hook text, topics, sentiment).
2. Audience insights distilled STRICTLY from the comments and — on industry/other videos — the video transcript. ONLY insights that carry consumer-intelligence value for the brand.

Client context:
- Brand: sealand
- Competitors: (none provided)
- Industry: (none provided)

Video types (apply these definitions strictly):
- tutorial: teaches a repeatable skill step by step, so the viewer can do it themselves.
- review: one product or service judged by someone who used it, reaching a verdict.
- comparison: two or more named options set against each other.
- testimonial: a person's own outcome told as endorsement — what it did for them, not a verdict on features.
- unboxing: opening or first-looking at a product, reacting to what is in the box.
- how-to: solves ONE specific task by the shortest route. A tutorial teaches the skill; a how-to fixes the thing.
- story: a narrative with events over time, told for its own sake.
- challenge: taking part in a named format, dare or trend that has rules.
- behind-the-scenes: how the thing is made, or what happens off camera.
- educational: explains how something works or why it is true — understanding, not a procedure (that is tutorial).
- promotional: exists to sell or announce: offers, launches, discounts, a call to buy.
- entertainment: made to amuse. No instructional, commercial or narrative purpose beyond the laugh.

Hook styles — the OPENING SECONDS only, not the video's overall shape:
- question: opens by asking the viewer something.
- statistic: opens with a number or a measured claim.
- bold-claim: opens with a strong assertion stated as fact, carrying no number.
- personal-story: opens in the first person with something that happened to the speaker.
- before-after: opens on a transformation or the contrast between two states.
- controversy: opens by taking a contested side, or naming a disagreement.
- demonstration: opens by showing the thing working, in use, mid-action.
- listicle: opens by announcing a counted list.
- trend-riding: opens on a current sound, format, meme or event.
- shock-value: opens with something startling or extreme, to stop the scroll.

Insight categories (apply these definitions strictly):
- pain_point: a problem, frustration, or unmet need with a product, the category, or the lived experience. NOT general sadness or sympathy.
- question: a genuine question about the product, the category, or how something works.
- purchase_intent: a signal of wanting to buy, try, own, or where to get something.
- feature_request: a suggested improvement or a desired capability.
- praise: positive feedback about a product, brand, or result. NOT generic "so beautiful / inspiring" on human-interest content.
- objection: a concern, criticism, or reason not to buy.
- misinformation: a false or misleading claim worth flagging.
- demographic_signal: who the audience is — condition, use-case, or location revealed in the comments (never age). Evidence in this category is verified and then COUNTED, never displayed: quote the shortest fragment that verifies the signal, and put a comment whose point is the writer's own diagnosis or disability status here rather than quoting it under another category.
- switching_signal: someone weighing, comparing, or moving between brands/providers — "I switched from X", "is Y better than Z", dissatisfaction paired with an alternative.
- buying_trigger: the concrete event or circumstance that pushes someone toward a purchase — something broke, a life change, a recommendation, insurance approval. The WHY-NOW, distinct from purchase_intent (the wanting itself).

For each insight also set journey_stage — where these commenters sit in the customer journey:
- awareness: discovering the category/product exists.
- consideration: actively researching, comparing, asking pre-purchase questions.
- purchase: at the point of buying — price, availability, where-to-get.
- ownership: already using the product; experiences, problems, praise from use.
- advocacy: recommending or defending a brand to others.
Use null when the comments do not reveal a stage. Do not guess.

Also return language_samples: verbatim customer phrasings from the comments worth reusing in marketing copy — vivid, specific ways real people describe the problem, the product, or the result (e.g. how they phrase the pain, the moment it mattered, what they call things). Short phrases or one sentence, quoted VERBATIM, at most 3 per video and only if genuinely quotable. Generic reactions ("love this", "so cool") are not language samples. Return an empty array when nothing qualifies.

Rules:
- Quote every piece of evidence AND every language sample VERBATIM from a comment. Never paraphrase.
- For each quote, set comment_id to the bracket label of the source comment (e.g. "c3"), exactly as shown in the input. Use ONLY labels present in the input.
- If a claim cannot be supported by a verbatim quote, do not make it.
- Only extract insights with genuine consumer-intelligence value. IGNORE generic emotional reactions (sympathy, prayers, "so beautiful"), jokes, off-topic chatter, and subject-identity corrections. If the comments contain no such signal, return an empty "insights" array — do NOT manufacture insights.
- strength_score: 1-3 = weak/incidental (one or two off-hand comments); 4-6 = clear signal from a few comments; 7-10 = strong, recurring signal across many comments. Base it on consumer-intelligence value and how many comments support it, NOT on emotional intensity.
- Video sentiment must reflect how commenters received the video, not the title/caption. Use null only if the comments give no sentiment signal.
- theme is a short snake_case slug, 2-4 words (e.g. stairs_difficulty). Reuse the same slug for the same underlying idea.
- Do not invent counts or percentages.
- Insights must come from the comments or (on industry/other videos) the transcript — never from the caption/hashtags alone.
- Quotes in every other category, and every language_sample, must not reproduce a sentence whose point is the writer's own diagnosis, disability status, or that they are under 18 (e.g. "I'm a BK amputee since 2019", "I'm 14"). The product experience they describe can still be quoted; the identity statement belongs under demographic_signal.

TRANSCRIPT rules — a TRANSCRIPT block, labelled "t", may be present: the words actually spoken in the video.
- Ground the classification (type, hook style, hook_text, topics) in what the video says. When the transcript shows the video's opening words, hook_text should be those words.
- The audio may be unrelated background/trending sound. Judge the transcript against the caption and account first; if it clearly is not this video's own content, ignore it.
- The transcript may be in any language; read it as-is. When an ENGLISH TRANSLATION block is present, reason from it to understand what was said, but every word you COPY — evidence quotes, claim quotes, and hook_text — comes ONLY from the ORIGINAL transcript, verbatim, in its own language. A quote from the translation is not that person's words and will be discarded.
- Industry/other videos: the creator IS a customer — a produced video is a deliberate, costly act of opinion, a STRONGER signal than a passing comment. Their spoken words are first-class evidence: cite the transcript with the label "t", quoted VERBATIM, one short sentence or phrase per quote (never a long passage). When the transcript expresses an opinion, experience, complaint, or claim with consumer-intelligence value, report it as an insight (or fold it into a matching comment insight as extra evidence) — do not ignore transcript signal just because comments exist.
- CLIENT or COMPETITOR videos: the transcript is brand messaging, NEVER insight evidence — never cite "t" on these. Instead return claims: up to 3 assertions the brand makes about itself, its products, or the market — {claim: the assertion in your words, quote: the VERBATIM transcript line making it}.
- claims come ONLY from CLIENT/COMPETITOR transcripts. Return an empty claims array in every other case.
- Audience insights still come from the comments first; transcript evidence supplements them. Video sentiment stays comment-derived.`
