import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateSayVsHear, buildSystemPromptA, buildUserPromptA, buildSystemPromptB, buildUserPromptB, stripOnCameraLabel, ON_CAMERA_LABEL } from './pass-d'
import { stripThemeRefs } from './prose-rules'
import { indexThemes } from './pass-c'
import type { AggregatedTheme } from './types'
import type { SayVsHearItemOut } from './schemas'

// Say-vs-hear validation pins (Step 2b): S# resolution, the silent contract
// (silence carries NO invented audience voice — enforced, not trusted), the
// they_say requirement on non-silent verdicts, the cap, and the v5 prompt
// blocks appearing exactly when client claims exist.

const CLAIMS = [
  { competitor: null, claim: 'Upcycled materials', quote: 'materials that would have been thrown away' },
  { competitor: null, claim: 'Lifetime warranty', quote: 'lifetime warranty, handmade' },
]

const item = (over: Partial<SayVsHearItemOut> = {}): SayVsHearItemOut => ({
  you_say_ref: 'S1',
  audience: 'echoes',
  they_say: 'The audience celebrates the upcycled craftsmanship',
  gap: 'Your material story lands — keep leading with it',
  supporting_themes: ['T1'],
  ...over,
})

describe('validateSayVsHear', () => {
  it('resolves S# leniently — case, brackets, spaces', () => {
    for (const ref of ['s2', 'S2', '[S2]', 'S 2']) {
      const r = validateSayVsHear([item({ you_say_ref: ref })], CLAIMS)
      expect(r, ref).toHaveLength(1)
      expect(r[0].claim.claim).toBe('Lifetime warranty')
    }
  })

  it('gives one claim at most one verdict (duplicate refs dropped)', () => {
    const r = validateSayVsHear([item(), item({ audience: 'contradicts' }), item({ you_say_ref: 'S2' })], CLAIMS)
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.claim.claim)).toEqual(['Upcycled materials', 'Lifetime warranty'])
  })

  it('drops unknown S# refs and empty gaps', () => {
    expect(validateSayVsHear([item({ you_say_ref: 'S9' })], CLAIMS)).toHaveLength(0)
    expect(validateSayVsHear([item({ gap: '  ' })], CLAIMS)).toHaveLength(0)
  })

  it('enforces the silent contract: no audience voice, no theme refs', () => {
    const r = validateSayVsHear(
      [item({ audience: 'silent', they_say: 'model tried to invent this', supporting_themes: ['T1', 'T2'] })],
      CLAIMS,
    )
    expect(r).toHaveLength(1)
    expect(r[0].they_say).toBeNull()
    expect(r[0].supporting_themes).toEqual([])
  })

  it('drops non-silent items without they_say', () => {
    expect(validateSayVsHear([item({ audience: 'contradicts', they_say: null })], CLAIMS)).toHaveLength(0)
    expect(validateSayVsHear([item({ they_say: '   ' })], CLAIMS)).toHaveLength(0)
  })

  it('caps at 3 items', () => {
    const claims = [...CLAIMS, { competitor: null, claim: 'c3', quote: 'q3' }, { competitor: null, claim: 'c4', quote: 'q4' }]
    const r = validateSayVsHear([item(), item({ you_say_ref: 'S2' }), item({ you_say_ref: 'S3' }), item({ you_say_ref: 'S4' })], claims)
    expect(r).toHaveLength(3)
  })
})

describe('stripThemeRefs — S#/C# leak coverage (Step 2b)', () => {
  it('strips leaked S# and C# handles like T#', () => {
    expect(stripThemeRefs('The claim [S1] is not landing')).toBe('The claim is not landing')
    expect(stripThemeRefs('Audiences push back (S2, S3)')).toBe('Audiences push back')
    expect(stripThemeRefs('As seen in [C2]')).toBe('As seen in')
  })
})

describe('D-a v5 prompt blocks', () => {
  const theme: AggregatedTheme = {
    bucket: 'client', category: 'praise', theme: 'upcycled_craftsmanship', memberThemes: [],
    supportingVideoIds: ['v1'], supportingInsightIds: ['i1'], evidenceCount: 3, videoEvidenceCount: 0, strengthScore: 7,
    meanStrength: 6.5, rankScore: 1.5,
    dominantEmotion: 'excited', dominantSentimentImpact: 'positive', singleSource: false, sampleDescriptions: [],
  }

  it('system prompt gains say_vs_hear instructions only with claims', () => {
    expect(buildSystemPromptA('Sealand', true)).toContain('say_vs_hear')
    expect(buildSystemPromptA('Sealand', false)).not.toContain('say_vs_hear')
  })

  it('v5 splices say_vs_hear as deliverable 4 BEFORE the Rules block', () => {
    const v5 = buildSystemPromptA('Sealand', true)
    expect(v5).toContain('Produce four things:')
    expect(v5).not.toContain('Produce three things:')
    expect(v5.indexOf('4. say_vs_hear')).toBeLessThan(v5.indexOf('Rules:'))
    expect(buildSystemPromptA('Sealand', false)).toContain('Produce three things:')
  })

  it('user prompt lists [S#] claims only when provided, byte-identical otherwise', () => {
    const idx = indexThemes([theme])
    const withClaims = buildUserPromptA(idx, new Map(), undefined, CLAIMS)
    expect(withClaims).toContain('WHAT THE BRAND SAYS IN ITS OWN VIDEOS')
    expect(withClaims).toContain('[S1] Upcycled materials — "materials that would have been thrown away"')
    expect(buildUserPromptA(idx, new Map(), undefined, [])).toBe(buildUserPromptA(idx, new Map(), undefined))
  })
})

describe('D-b — the brief knows who is speaking (WP7a)', () => {
  const insight = {
    index: 'M1',
    title: 'Sizing is a coin toss',
    description: 'Buyers cannot tell which size to order.',
    quotes: [
      { text: 'I ordered a medium and it swam on me', spokenOnVideo: false },
      { text: 'I sized up after measuring twice and it still runs long', spokenOnVideo: true },
    ],
    competitorQuotes: [],
  }

  it('labels the spoken voice and leaves the typed one bare', () => {
    const prompt = buildUserPromptB([insight], new Map(), undefined)
    expect(prompt).toContain(`"I sized up after measuring twice and it still runs long" ${ON_CAMERA_LABEL}`)
    expect(prompt).toContain('"I ordered a medium and it swam on me"\n')
    expect(prompt).not.toContain(`"I ordered a medium and it swam on me" ${ON_CAMERA_LABEL}`)
  })

  it('keeps the label outside the quotation marks, so a copied verbatim is only the words', () => {
    const line = buildUserPromptB([insight], new Map(), undefined)
      .split('\n')
      .find((l) => l.includes('sized up'))!
    expect(line.trim()).toBe(`· "I sized up after measuring twice and it still runs long" ${ON_CAMERA_LABEL}`)
  })

  it('tells the model what the label means and that it is never part of a quote', () => {
    const sys = buildSystemPromptB('Sealand')
    expect(sys).toContain(ON_CAMERA_LABEL)
    expect(sys).toContain('never copy it into a quote')
  })

  it('strips the label off a hero quote the model echoed it with', () => {
    expect(stripOnCameraLabel('I sized up after measuring twice (said on camera)')).toBe('I sized up after measuring twice')
    expect(stripOnCameraLabel('I sized up after measuring twice')).toBe('I sized up after measuring twice')
    // Only a trailing label goes — a verbatim that really contains the words is left alone.
    expect(stripOnCameraLabel('He literally (said on camera) that it broke')).toBe('He literally (said on camera) that it broke')
  })
})

describe('when the recommendations of an update are allowed to disappear', () => {
  // NOT a behaviour test — the delete is I/O glue and this repo does not mock
  // the world to test glue. It is a position test, on the one ordering that
  // decides whether a failed D-b call costs a client their recommendations.
  //
  // What it guards: `runPassD` used to delete the run's recommendations before
  // the D-b call, so a call that threw (a 500 from OpenAI) or returned no parsed
  // output (a refusal) left a completed update showing ZERO recommendations —
  // while the comment beside the OTHER delete promised "a failed call leaves the
  // old rows", which was true only for the operator's rerun path. Both paths now
  // delete after a successful parse. Nothing else in this file notices if that
  // moves back.
  const src = readFileSync(new URL('./pass-d.ts', import.meta.url), 'utf8')
  const at = (needle: string) => {
    const i = src.indexOf(needle)
    expect(i, `pass-d.ts no longer contains ${needle}`).toBeGreaterThan(-1)
    return i
  }

  it('deletes the run’s recommendations in exactly one place', () => {
    expect([...src.matchAll(/from\('recommendations'\)\s*\.delete\(\)/g)]).toHaveLength(1)
  })

  it('does it only after the D-b call has parsed', () => {
    const del = at("from('recommendations').delete()")
    expect(del).toBeGreaterThan(at('b = await structuredCall<PassDbOutput>'))
    expect(del).toBeGreaterThan(at('if (!b.parsed) {'))
  })

  it('reads the priors before removing them', () => {
    // applyLineage matches against this run's own rows when it has some (a D-b
    // rerun). If the delete ran first there would be nothing left to match.
    expect(at('await applyLineage(')).toBeLessThan(at("from('recommendations').delete()"))
  })

  it('still clears the market insights before reinserting them', () => {
    // The other half of invariant 6, unchanged: these ARE rewritten in the same
    // breath, so their delete belongs where it is.
    expect(at("from('market_insights').delete()")).toBeLessThan(at("from('market_insights')\n        .insert(miRows)"))
  })

  it('reads the decision ledger newest-first, under its stated cap', () => {
    // Also a source test, and for the same reason: the read is I/O glue, but
    // which THOUSAND rows it gets back decides whether a client's status is the
    // one they set or one they have since changed. `rec_decisions` is
    // append-only and never pruned, so it will meet PostgREST's silent 1000; at
    // that point oldest-first drops the newest decisions — the ones that decide
    // the answer — and logs `lineage_decisions: 1000` as if all were well.
    // (`inheritedStatus` takes the max itself, so the order is not load-bearing
    // for correctness within the page; WHICH page is.)
    const read = src.slice(at('.from(REC_DECISIONS_TABLE)'), at('if (error) throw error'))
    expect(read).toContain(".order('decided_at', { ascending: false })")
    expect(read).toContain(".order('id', { ascending: false })")
    expect(read).toContain('.limit(REC_DECISIONS_READ_LIMIT)')
    // `id` is selected because it is the tiebreaker both the order and
    // inheritedStatus use.
    expect(read).toContain("select('id, lineage_id, status, decided_at')")
  })
})
