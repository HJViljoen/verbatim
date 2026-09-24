import { describe, expect, it } from 'vitest'

import {
  PROPOSE_CANDIDATE_TARGET,
  attachClaimVideos,
  buildProposeSystemPrompt,
  PROPOSE_PROMPT_VERSION,
  buildProposeUserPrompt,
  claimSources,
  proposalSummary,
  themeSources,
  validateProposal,
  type ProposalSource,
} from './propose'

const theme = (label: string, videos: number, registry_id: string | null = `reg-${label}`) =>
  ({ label, videos, registry_id })

describe('claimSources', () => {
  it('numbers the blocks from c1 and carries the video each claim came off', () => {
    const s = claimSources([{ claim: 'Upcycled from sails' }, { claim: 'Made in Cape Town' }], ['vid-1', null])
    expect(s.map((x) => x.ref)).toEqual(['c1', 'c2'])
    expect(s.map((x) => x.sourceRef)).toEqual(['vid-1', null])
    expect(s.every((x) => x.kind === 'claim')).toBe(true)
  })

  it('caps the pool without renumbering what survives', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ claim: `claim ${i}` }))
    const s = claimSources(many, [], 3)
    expect(s.map((x) => x.ref)).toEqual(['c1', 'c2', 'c3'])
  })
})

describe('themeSources', () => {
  it('ranks by distinct videos and prints the share of the bucket', () => {
    const s = themeSources([theme('b', 40), theme('a', 182), theme('c', 5)], 891)
    expect(s.map((x) => x.text)).toEqual(['a', 'b', 'c'])
    expect(s[0].sharePct).toBe(20.4) // 182/891, the measured Össur figure
    expect(s.map((x) => x.ref)).toEqual(['t1', 't2', 't3'])
  })

  it('drops a theme with no registry id — no cross-run identity, no provenance', () => {
    const s = themeSources([theme('kept', 10), theme('dropped', 99, null)], 100)
    expect(s.map((x) => x.text)).toEqual(['kept'])
  })

  it('does not divide by a bucket of zero', () => {
    expect(themeSources([theme('a', 3)], 0)[0].sharePct).toBe(0)
  })

  it('breaks a tie by label, so the same corpus builds the same prompt twice', () => {
    const s = themeSources([theme('zulu', 5), theme('alpha', 5)], 10)
    expect(s.map((x) => x.text)).toEqual(['alpha', 'zulu'])
  })
})

describe('attachClaimVideos', () => {
  const rows = [
    { claim: 'Upcycled from sails', source_video_id: 'vid-1' },
    { claim: '  upcycled   FROM sails ', source_video_id: 'vid-1' },
    { claim: 'Made in Cape Town', source_video_id: 'vid-2' },
    { claim: 'Made in Cape Town', source_video_id: 'vid-3' },
  ]

  it('joins on the normalised text, so spelling does not split a claim', () => {
    expect(attachClaimVideos([{ claim: 'UPCYCLED from  sails' }], rows)).toEqual(['vid-1'])
  })

  it('gives no provenance rather than a wrong one when a claim is on two videos', () => {
    expect(attachClaimVideos([{ claim: 'Made in Cape Town' }], rows)).toEqual([null])
  })

  it('returns null for a claim nothing matches', () => {
    expect(attachClaimVideos([{ claim: 'never said' }], rows)).toEqual([null])
  })
})

describe('the prompt', () => {
  const sources: ProposalSource[] = [
    { ref: 'c1', kind: 'claim', text: 'Upcycled from sails', sourceRef: 'vid-1' },
    { ref: 't1', kind: 'theme', text: 'Price and availability questions', sourceRef: 'reg-1', videos: 50, sharePct: 6.5 },
  ]

  it('labels the two pools and answers by ref, never by uuid', () => {
    const user = buildProposeUserPrompt(sources)
    expect(user).toContain('[c1] Upcycled from sails')
    expect(user).toContain('[t1] Price and availability questions — 50 videos, 6.5%')
    expect(user).not.toContain('vid-1')
    expect(user).not.toContain('reg-1')
  })

  it('says something rather than nothing for a tenant with no claims and no themes', () => {
    expect(buildProposeUserPrompt([])).toContain('nothing on file')
  })

  it('tells the model what a subject is NOT, with the two real counter-examples', () => {
    const system = buildProposeSystemPrompt()
    expect(system).toContain('audience identities and amputation types')
    expect(system).toContain('admiration for personal resilience')
    expect(system).toContain(String(PROPOSE_CANDIDATE_TARGET))
  })

  it('asks for a positive description and refuses the exclusion clause by name', () => {
    // v1 asked for "what counts as this subject and what does not", and got
    // "Comments about X, excluding Y" on all six of Sealand's subjects. A
    // vector has no negation, so the clause put Y into the phrase positively —
    // and the two subjects carrying the longest ones are the two the judge
    // rejects most (16% and 17% yes-rate against 87-95%). `subjectEmbedInput`
    // strips it downstream; this stops it at the source.
    const system = buildProposeSystemPrompt()
    expect(system).toContain('POSITIVE sentence')
    expect(system).toContain('says only what BELONGS')
    // The four phrasings the model actually reached for, named so it cannot
    // route around the rule with a synonym.
    for (const phrase of ['excluding X', 'not including X', 'but not X', 'except X']) {
      expect(system, phrase).toContain(phrase)
    }
    // And the v1 instruction is gone, not merely contradicted later in the
    // prompt — a prompt that asks for both gets both.
    expect(system).not.toContain('and what does not')
  })

  it('bumps its version with the change, so a logged call says which prompt wrote it', () => {
    // Every `ai_call_log` row this pass writes carries it; a description shape
    // that changed under an unchanged version is a change nobody can date.
    expect(PROPOSE_PROMPT_VERSION).toBe('subject_propose_v2')
  })
})

describe('validateProposal', () => {
  const sources: ProposalSource[] = [
    { ref: 'c1', kind: 'claim', text: 'a claim', sourceRef: 'vid-1' },
    { ref: 't1', kind: 'theme', text: 'a theme', sourceRef: 'reg-1', videos: 9, sharePct: 1 },
    { ref: 't2', kind: 'theme', text: 'another theme', sourceRef: 'reg-2', videos: 4, sharePct: 0.4 },
  ]
  const answer = (subjects: { name: string; description?: string; refs?: string[]; rationale?: string }[]) => ({
    subjects: subjects.map((s) => ({ description: 'what counts', refs: [], rationale: 'because', ...s })),
  })

  it('takes a claim ref as the anchor even when a theme ref comes first', () => {
    // The brand having said it is the stronger provenance, whatever order the
    // model happened to list its refs in.
    const [c] = validateProposal(answer([{ name: 'comfort', refs: ['t1', 'c1'] }]), sources)
    expect(c.origin).toBe('own_claims')
    expect(c.sourceRef).toBe('vid-1')
    expect(c.refs).toEqual(['t1', 'c1'])
  })

  it('reads a theme-only candidate as category_theme', () => {
    const [c] = validateProposal(answer([{ name: 'price', refs: ['t2'] }]), sources)
    expect(c.origin).toBe('category_theme')
    expect(c.sourceRef).toBe('reg-2')
  })

  it('calls a candidate with no refs a synthesis and gives it no source', () => {
    const [c] = validateProposal(answer([{ name: 'durability', refs: [] }]), sources)
    expect(c.origin).toBe('client')
    expect(c.sourceRef).toBeNull()
  })

  it('drops an invented ref instead of guessing which block it meant', () => {
    const [c] = validateProposal(answer([{ name: 'looks', refs: ['t9', 'c1'] }]), sources)
    expect(c.refs).toEqual(['c1'])
    expect(c.sourceRef).toBe('vid-1')
  })

  it('keeps a candidate whose every ref was invented, without borrowing a source', () => {
    const [c] = validateProposal(answer([{ name: 'weight', refs: ['t9', 'c7'] }]), sources)
    expect(c.origin).toBe('client')
    expect(c.sourceRef).toBeNull()
  })

  it('lowercases names and drops a duplicate, keeping the higher-ranked one', () => {
    const out = validateProposal(
      answer([{ name: 'Comfort', refs: ['c1'] }, { name: ' comfort ', refs: ['t1'] }]),
      sources,
    )
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('comfort')
    expect(out[0].origin).toBe('own_claims')
  })

  it('drops a nameless candidate', () => {
    expect(validateProposal(answer([{ name: '   ' }]), sources)).toEqual([])
  })
})

describe('proposalSummary', () => {
  it('numbers the candidates, names where each came from, and shows its refs', () => {
    const text = proposalSummary({
      clientId: 'c',
      sources: [],
      costUsd: 0.002,
      candidates: [
        { name: 'comfort', description: 'how it feels', origin: 'own_claims', sourceRef: 'v', refs: ['c1'], rationale: 'they say it' },
        { name: 'price', description: 'what it costs', origin: 'category_theme', sourceRef: 'r', refs: ['t1'], rationale: 'asked a lot' },
      ],
    })
    expect(text).toContain('1. comfort (own voice) [c1]')
    expect(text).toContain('2. price (category) [t1]')
    expect(text).toContain('why: they say it')
  })

  it('says why there is nothing rather than printing an empty list', () => {
    expect(proposalSummary({ clientId: 'c', sources: [], candidates: [], costUsd: 0, error: 'no parsed output' }))
      .toBe('no candidates: no parsed output')
  })
})
