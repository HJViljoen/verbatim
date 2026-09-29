import { describe, expect, it } from 'vitest'
import {
  PLAN_VERDICT_MIN_VIDEOS,
  VERDICT_NEW_EVIDENCE_SHARE,
  diffVerdicts,
  holdVerdicts,
  shortlistThemes,
  summarise,
  validateJudgement,
  validateVerdicts,
  type AskTheme,
  type RawVerdict,
} from './verdicts'
import type { ClaimResult, ExtractedClaim } from './types'

// The engine's whole value is that it cannot bluff. These tests are the
// contract: a claim the model asserted but could not ground must come back
// "the conversation does not speak to this", and the model's own proposals must
// never be able to reach the grounded register.

const theme = (id: string, over: Partial<AskTheme> = {}): AskTheme => ({
  themeId: id,
  registryId: `reg-${id}`,
  label: `theme ${id}`,
  description: 'd',
  bucket: 'industry-other',
  insightIds: [`i-${id}-1`, `i-${id}-2`],
  videoIds: [`v-${id}-1`, `v-${id}-2`],
  embedding: null,
  ...over,
})

/** Full grounding: every insight exists, is quotable, and maps to a video. */
const groundingFor = (themes: AskTheme[]) => ({
  liveInsightIds: new Set(themes.flatMap((t) => t.insightIds)),
  quotedInsightIds: new Set(themes.flatMap((t) => t.insightIds)),
  videoByInsightId: new Map(themes.flatMap((t) => t.insightIds.map((id, i) => [id, t.videoIds[i % t.videoIds.length]]))),
})

/** The register's rules below are about grounding, not volume: they run with
 *  the video floor at one, and the floor has its own describe block. */
const validateAtOne = (...args: Parameters<typeof validateVerdicts>) =>
  validateVerdicts(args[0], args[1], args[2], args[3], { minVideos: 1 })

const claims: ExtractedClaim[] = [
  { ref: 'C1', claim: 'price is the main barrier' },
  { ref: 'C2', claim: 'buyers compare us on weight' },
]

describe('shortlistThemes', () => {
  const claimVecs = [[1, 0], [0, 1]]
  const themes = [
    theme('a', { embedding: [1, 0] }),
    theme('b', { embedding: [0.92, 0.39] }),
    theme('c', { embedding: [0, 1] }),
    theme('d', { embedding: null }),
  ]

  it('ranks by similarity and caps per claim', () => {
    const out = shortlistThemes(claims, claimVecs, themes, { perClaim: 1 })
    expect(out[0].themes.map((t) => t.themeId)).toEqual(['a'])
    expect(out[1].themes.map((t) => t.themeId)).toEqual(['c'])
  })

  it('drops themes below the citation floor rather than padding the shortlist', () => {
    // A theme that merely exists is not evidence that a claim is echoed — the
    // same floor Pass C and D-a apply to their citations.
    const out = shortlistThemes([claims[0]], [[1, 0]], [theme('far', { embedding: [0, 1] })], {
      perClaim: 5,
    })
    expect(out[0].themes).toEqual([])
  })

  it('ignores themes with no embedding instead of ranking them arbitrarily', () => {
    const out = shortlistThemes([claims[0]], [[1, 0]], [theme('d', { embedding: null })], { perClaim: 5 })
    expect(out[0].themes).toEqual([])
  })

  it('returns an empty shortlist rather than throwing when a claim failed to embed', () => {
    const out = shortlistThemes(claims, [[], []], themes, { perClaim: 3 })
    expect(out.every((s) => s.themes.length === 0)).toBe(true)
  })
})

describe('validateVerdicts — the grounded register', () => {
  const pool = new Map([['c1', [theme('a'), theme('b')]], ['c2', [theme('c')]]])

  it('grounds an echoed claim in resolved themes and counts conversations from them', () => {
    const raw: RawVerdict[] = [
      { claim_ref: 'C1', verdict: 'echoes', they_say: 'cost comes up constantly', theme_refs: ['T1', 'T2'] },
    ]
    const [c1] = validateAtOne(raw, claims, pool)
    expect(c1.verdict).toBe('echoes')
    expect(c1.themeRefs.map((t) => t.themeId)).toEqual(['a', 'b'])
    // 2 videos per theme, no overlap -> 4 conversations. The model is never
    // asked for this number.
    expect(c1.conversationCount).toBe(4)
    expect(c1.insightIds).toHaveLength(4)
  })

  it('forces silence to carry no audience voice and no themes', () => {
    // The model saying "silent" and then quoting the audience contradicts
    // itself; the silent reading is the conservative one.
    const raw: RawVerdict[] = [
      { claim_ref: 'C1', verdict: 'silent', they_say: 'people definitely say this', theme_refs: ['T1'] },
    ]
    const [c1] = validateAtOne(raw, claims, pool)
    expect(c1).toMatchObject({ verdict: 'silent', theySay: null, conversationCount: 0 })
    expect(c1.themeRefs).toEqual([])
  })

  it('downgrades an asserted claim whose themes do not resolve to untested', () => {
    // The reverse contract, and the anti-bluff rule: asserted-but-ungrounded is
    // "we cannot tell you", never "supported".
    const raw: RawVerdict[] = [
      { claim_ref: 'C1', verdict: 'echoes', they_say: 'lots of people agree', theme_refs: ['T99'] },
    ]
    const [c1] = validateAtOne(raw, claims, pool)
    expect(c1.verdict).toBe('silent')
    expect(c1.theySay).toBeNull()
  })

  it('downgrades a non-silent verdict with no audience voice', () => {
    const raw: RawVerdict[] = [{ claim_ref: 'C1', verdict: 'contradicts', they_say: '  ', theme_refs: ['T1'] }]
    expect(validateAtOne(raw, claims, pool)[0].verdict).toBe('silent')
  })

  it('answers every submitted claim, including ones the model skipped', () => {
    // A plan with 30 claims must not come back with 12 answers and no account
    // of the rest.
    const raw: RawVerdict[] = [
      { claim_ref: 'C1', verdict: 'echoes', they_say: 'cost comes up', theme_refs: ['T1'] },
    ]
    const out = validateAtOne(raw, claims, pool)
    expect(out.map((c) => c.ref)).toEqual(['C1', 'C2'])
    expect(out[1].verdict).toBe('silent')
  })

  it('resolves refs whatever punctuation wraps them', () => {
    for (const form of ['C1', '[C1]', 'c1', ' C1 ']) {
      const raw: RawVerdict[] = [
        { claim_ref: form, verdict: 'echoes', they_say: 'cost comes up', theme_refs: ['T1'] },
      ]
      expect(validateAtOne(raw, claims, pool)[0].verdict, `ref form ${form}`).toBe('echoes')
    }
  })

  it('ignores verdicts for claims nobody asked about', () => {
    const raw: RawVerdict[] = [
      { claim_ref: 'C9', verdict: 'echoes', they_say: 'invented', theme_refs: ['T1'] },
    ]
    expect(validateAtOne(raw, claims, pool).every((c) => c.verdict === 'silent')).toBe(true)
  })

  it('takes one verdict per claim and drops a second opinion', () => {
    const raw: RawVerdict[] = [
      { claim_ref: 'C1', verdict: 'echoes', they_say: 'cost comes up', theme_refs: ['T1'] },
      { claim_ref: 'C1', verdict: 'contradicts', they_say: 'actually no', theme_refs: ['T2'] },
    ]
    expect(validateAtOne(raw, claims, pool)[0].verdict).toBe('echoes')
  })

  it('treats an unrecognised verdict word as silence', () => {
    const raw: RawVerdict[] = [
      { claim_ref: 'C1', verdict: 'probably-ish', they_say: 'hedge', theme_refs: ['T1'] },
    ]
    expect(validateAtOne(raw, claims, pool)[0].verdict).toBe('silent')
  })

  it('counts a shared video once across two themes', () => {
    const overlap = new Map([['c1', [theme('a', { videoIds: ['v1', 'v2'] }), theme('b', { videoIds: ['v2', 'v3'] })]]])
    const raw: RawVerdict[] = [
      { claim_ref: 'C1', verdict: 'echoes', they_say: 'x', theme_refs: ['T1', 'T2'] },
    ]
    expect(validateAtOne(raw, [claims[0]], overlap)[0].conversationCount).toBe(3)
  })
})

describe('summarise', () => {
  it('counts the three registers the summary line reports', () => {
    const mk = (ref: string, verdict: ClaimResult['verdict']): ClaimResult => ({
      ref, claim: 'c', verdict, theySay: null, conversationCount: 0, themeRefs: [], insightIds: [],
    })
    expect(summarise([mk('C1', 'echoes'), mk('C2', 'contradicts'), mk('C3', 'silent'), mk('C4', 'silent')]))
      .toEqual({ supported: 1, contradicted: 1, untested: 2 })
  })
})

describe('validateJudgement — the model may propose, but not pose as evidence', () => {
  const results: ClaimResult[] = [
    { ref: 'C1', claim: 'a', verdict: 'echoes', theySay: 'x', conversationCount: 3, themeRefs: [], insightIds: [] },
  ]

  it('keeps proposals and resolves the claims they reason from', () => {
    const out = validateJudgement([{ text: 'Lead with financing.', based_on_refs: ['[C1]'] }], results)
    expect(out).toEqual([{ text: 'Lead with financing.', basedOnRefs: ['C1'] }])
  })

  it('strips citations to claims that do not exist, but keeps the proposal', () => {
    // Deleting the model's reasoning would leave the reader believing the
    // evidence was all there was; stripping the false citation is enough.
    const out = validateJudgement([{ text: 'Try a bundle.', based_on_refs: ['C9'] }], results)
    expect(out).toEqual([{ text: 'Try a bundle.', basedOnRefs: [] }])
  })

  it('drops empty proposals', () => {
    expect(validateJudgement([{ text: '   ', based_on_refs: ['C1'] }], results)).toEqual([])
  })

  it('survives a missing judgement array', () => {
    expect(validateJudgement([], results)).toEqual([])
  })
})

describe('diffVerdicts — what moved since last week', () => {
  const mk = (ref: string, verdict: ClaimResult['verdict']): ClaimResult => ({
    ref, claim: `claim ${ref}`, verdict, theySay: null, conversationCount: 0, themeRefs: [], insightIds: [],
  })

  it('reports a verdict that changed, with both sides', () => {
    const moved = diffVerdicts([mk('C1', 'silent')], [mk('C1', 'contradicts')])
    expect(moved).toEqual([{ ref: 'C1', claim: 'claim C1', from: 'silent', to: 'contradicts' }])
  })

  it('says nothing when the plan still reads the same way', () => {
    expect(diffVerdicts([mk('C1', 'echoes')], [mk('C1', 'echoes')])).toEqual([])
  })

  it('ignores claims that did not exist in the earlier evaluation', () => {
    expect(diffVerdicts([], [mk('C1', 'echoes')])).toEqual([])
  })
})

describe('grounding — a verdict must rest on something a person actually said', () => {
  const a = theme('a')
  const pool = new Map([['c1', [a]]])
  const echo: RawVerdict[] = [
    { claim_ref: 'C1', verdict: 'echoes', they_say: 'people say it constantly', theme_refs: ['T1'] },
  ]

  it('downgrades to untested when no cited insight carries a quotable comment', () => {
    // THE anti-bluff rule. Verdict, count and theme ids were all structurally
    // valid; theySay is free prose. Without a real comment behind it, a
    // fabricated audience finding would render under a "Supported" badge with
    // a counted number beside it. Supported-with-nothing-to-show is the shape a
    // bluff takes.
    const g = { ...groundingFor([a]), quotedInsightIds: new Set<string>() }
    const [c1] = validateAtOne(echo, claims, pool, g)
    expect(c1.verdict).toBe('silent')
    expect(c1.theySay).toBeNull()
  })

  it('downgrades to untested when the cited insights no longer exist', () => {
    // themes outlive their insights (prune-stale-analysis), so re-evaluating
    // an older run must not count rows that are gone.
    const g = { ...groundingFor([a]), liveInsightIds: new Set<string>() }
    expect(validateAtOne(echo, claims, pool, g)[0].verdict).toBe('silent')
  })

  it('counts conversations from the cited insights’ own videos, not the theme’s whole breadth', () => {
    // A claim touching one facet of a broad theme must not inherit the theme's
    // total reach: "heard across 78 conversations" when nothing in those 78 was
    // tested against the claim is a true number attached to the wrong thing.
    const broad = theme('broad', {
      insightIds: ['i1', 'i2'],
      videoIds: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'],
    })
    const g = {
      liveInsightIds: new Set(['i1', 'i2']),
      quotedInsightIds: new Set(['i1', 'i2']),
      videoByInsightId: new Map([['i1', 'v1'], ['i2', 'v1']]),
    }
    const [c1] = validateAtOne(echo, claims, new Map([['c1', [broad]]]), g)
    expect(c1.conversationCount).toBe(1)
  })

  it('keeps only the insights it can actually stand behind', () => {
    const g = {
      liveInsightIds: new Set(['i-a-1', 'i-a-2']),
      quotedInsightIds: new Set(['i-a-1']),
      videoByInsightId: new Map([['i-a-1', 'v-a-1']]),
    }
    expect(validateAtOne(echo, claims, pool, g)[0].insightIds).toEqual(['i-a-1'])
  })

  it('still works with no grounding supplied (the pure-logic path)', () => {
    expect(validateAtOne(echo, claims, pool)[0].verdict).toBe('echoes')
  })
})

describe('diffVerdicts — a run must never be diffed against itself', () => {
  const mk = (ref: string, verdict: ClaimResult['verdict']): ClaimResult => ({
    ref, claim: `claim ${ref}`, verdict, theySay: null, conversationCount: 0, themeRefs: [], insightIds: [],
  })

  it('reports nothing when both sides are the same reading', () => {
    // The retry case: if the baseline query picked up the row this same run
    // just wrote, `moved` would come back empty and overwrite the real one. The
    // query excludes the current run; this pins what that protects.
    const current = [mk('C1', 'contradicts')]
    expect(diffVerdicts(current, current)).toEqual([])
  })
})

// Walkthrough item 5: the mock plan's verdicts moved "Contradicted → Untested",
// "Supported → Untested" within days on no new evidence. A re-reading
// proposes; `holdVerdicts` decides, against the verdict printed last.
describe('holdVerdicts — a verdict moves only when its evidence does', () => {
  const floor = Math.max(PLAN_VERDICT_MIN_VIDEOS, 3)
  const vids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
  const c = (ref: string, verdict: ClaimResult['verdict'], videos: string[], over: Partial<ClaimResult> = {}): ClaimResult => ({
    ref, claim: `claim ${ref}`, verdict,
    theySay: verdict === 'silent' ? null : `they say ${verdict}`,
    conversationCount: verdict === 'silent' ? 0 : videos.length,
    themeRefs: [], insightIds: verdict === 'silent' ? [] : videos.map((v) => `ins-${v}`), source: null,
    ...over,
  })
  // The caller resolves insights to videos; here the insight id names its video.
  const videosOf = (x: ClaimResult) => new Set(x.insightIds.map((id) => id.replace(/^ins-/, '')))

  it('keeps a standing verdict when a re-reading goes untested', () => {
    const before = c('C1', 'echoes', vids('a', floor + 2))
    const [held] = holdVerdicts([before], [c('C1', 'silent', [])], videosOf)
    expect(held.verdict).toBe('echoes')
    expect(held.insightIds).toEqual(before.insightIds)
    expect(diffVerdicts([before], [held])).toEqual([])
  })

  it('keeps a standing verdict when the opposite reading rests on the same videos', () => {
    const before = c('C1', 'contradicts', vids('a', floor + 4))
    const flip = c('C1', 'echoes', vids('a', floor + 2))
    expect(holdVerdicts([before], [flip], videosOf)[0].verdict).toBe('contradicts')
  })

  it('prints the opposite reading once enough of its videos are new', () => {
    const before = c('C1', 'contradicts', vids('a', floor + 1))
    const total = floor * 2
    const newShare = Math.ceil(total * VERDICT_NEW_EVIDENCE_SHARE)
    const flip = c('C1', 'echoes', [...vids('a', total - newShare), ...vids('b', newShare)])
    expect(holdVerdicts([before], [flip], videosOf)[0].verdict).toBe('echoes')
  })

  it('takes a fresh reading of the same verdict, with its newer evidence', () => {
    const before = c('C1', 'echoes', vids('a', floor))
    const again = c('C1', 'echoes', vids('b', floor + 1))
    expect(holdVerdicts([before], [again], videosOf)[0]).toEqual(again)
  })

  it('gives an untested claim a verdict only when two re-readings in a row agree', () => {
    const untested = c('C1', 'silent', [])
    const first = holdVerdicts([untested], [c('C1', 'contradicts', vids('a', floor))], videosOf)[0]
    expect(first.verdict).toBe('silent')
    expect(first.pending).toEqual({ verdict: 'contradicts' })
    const second = holdVerdicts([first], [c('C1', 'contradicts', vids('a', floor))], videosOf)[0]
    expect(second.verdict).toBe('contradicts')
    expect(second.pending).toBeUndefined()
    // A disagreeing second reading starts the count again.
    const other = holdVerdicts([first], [c('C1', 'echoes', vids('a', floor))], videosOf)[0]
    expect(other.verdict).toBe('silent')
    expect(other.pending).toEqual({ verdict: 'echoes' })
    // And an untested one clears what was pending.
    expect(holdVerdicts([first], [c('C1', 'silent', [])], videosOf)[0].pending).toBeUndefined()
  })

  it('lets a verdict under the floor go untested, and never prints it as one', () => {
    if (PLAN_VERDICT_MIN_VIDEOS < 2) return
    const weak = c('C1', 'contradicts', vids('a', PLAN_VERDICT_MIN_VIDEOS - 1))
    expect(holdVerdicts([weak], [c('C1', 'silent', [])], videosOf)[0].verdict).toBe('silent')
    const proposed = holdVerdicts([weak], [c('C1', 'echoes', vids('b', PLAN_VERDICT_MIN_VIDEOS))], videosOf)[0]
    expect(proposed.verdict).toBe('silent')
    expect(proposed.pending).toEqual({ verdict: 'echoes' })
  })

  it('reads a claim with no earlier reading as it comes', () => {
    const fresh = c('C9', 'echoes', vids('a', floor))
    expect(holdVerdicts([], [fresh], videosOf)).toEqual([fresh])
  })
})

describe('validateVerdicts — the video floor', () => {
  it('reads a verdict on fewer videos than the floor as untested', () => {
    if (PLAN_VERDICT_MIN_VIDEOS < 2) return
    const t = theme('T', {
      insightIds: Array.from({ length: PLAN_VERDICT_MIN_VIDEOS }, (_, i) => `i-${i}`),
      videoIds: Array.from({ length: PLAN_VERDICT_MIN_VIDEOS - 1 }, (_, i) => `v-${i}`),
    })
    const g = groundingFor([t])
    const raw: RawVerdict[] = [{ claim_ref: 'C1', verdict: 'contradicts', they_say: 'they disagree', theme_refs: ['T1'] }]
    const out = validateVerdicts(raw, [claims[0]], new Map([['c1', [t]]]), g)
    expect(out[0].verdict).toBe('silent')
  })
})
