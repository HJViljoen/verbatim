import { describe, expect, it, vi } from 'vitest'

import {
  OWN_POST_JUDGE_VERSION, buildJudgeUserPrompt, defaultSince, judgeCostEstimate, judgeMode, judgePosts, judgeRows, postText, postsToJudge,
  readRowsFile, unfiledRows, wordsIn,
  type JudgeCall, type JudgePost, type JudgeSubject,
} from './subject-judge'

// Sealand on staging (read 27 Sep): the 16 Sep post "A glimpse into Protect
// our Paths" with its topics and three of its claims, and three of the
// tenant's subjects with their descriptions. The model is mocked throughout:
// no test here, and no dry run of the script, reaches OpenAI.
const POST: JudgePost = {
  id: 'cc07b3ba-f683-4f3d-bb80-0f126bec8f49',
  caption: 'A glimpse into Protect our Paths. At the heart of Protect our Paths is a deep love for nature - and a belief that protecting our natural environment goes',
  topics: ['environmental conservation', 'community involvement', 'litter management', 'nature protection', 'social upliftment'],
  transcript: null,
  claims: [
    { id: 'f6a12853', claim: 'Sealand Gear supports this passion project as part of its commitment to environmental and social causes.', quote: 'I guess from a Sealine perspective, it is true to what the business is.' },
    { id: '7974b2df', claim: 'Protect Our Paths is a community-driven environmental initiative started in 2022 focused on litter management and nature conservation.', quote: 'Protect Our Paths has been going since 2022.' },
    { id: 'da37c468', claim: 'The initiative encourages everyone to pick up at least one piece of litter to collectively make a significant impact.', quote: null },
  ],
}
const SUBJECTS: JudgeSubject[] = [
  { id: '1db58231', name: 'Community & purpose', description: 'Comments about the brand’s community initiatives and purpose, such as giveaways, community and beach clean-ups.' },
  { id: '27ac98cd', name: 'Waterproofing', description: 'Comments about how well the bags keep their contents dry in rain and travel.' },
  { id: 'cf7bd22c', name: 'Price', description: 'Comments about product pricing, sales, discounts, or value for money.' },
]
const ANSWER = {
  decisions: [
    { ref: 'P', subject: 'S1', touches: true, words: ['community involvement', 'litter management'], reason: 'about a community clean-up initiative' },
    { ref: 'P', subject: 'S2', touches: false, words: [], reason: 'nothing about keeping things dry' },
    { ref: 'P', subject: 'S3', touches: false, words: [], reason: 'no price' },
    { ref: 'C1', subject: 'S1', touches: true, words: ['social causes'], reason: 'purpose' },
    // "touches" with a word the claim does not contain: filed as no.
    { ref: 'C2', subject: 'S1', touches: true, words: ['beach clean-up'], reason: 'clean-up' },
    // A ref that does not exist, and a repeat: dropped.
    { ref: 'C9', subject: 'S1', touches: true, words: ['litter'], reason: 'x' },
    { ref: 'P', subject: 'S1', touches: false, words: [], reason: 'repeat' },
  ],
}
const NOW = '2026-11-22T09:00:00.000Z'

describe('judgeRows', () => {
  const rows = judgeRows({ parsed: ANSWER, post: POST, subjects: SUBJECTS, clientId: 'ac16988e', decidedAt: NOW, actorLabel: 'scripts/own-post-subjects.ts --apply' })

  it('files one row per answered pair, the post as claim_id null, in MF3’s shape', () => {
    expect(rows.map((r) => [r.claim_id, r.subject_id, r.touches])).toEqual([
      [null, '1db58231', true],
      [null, '27ac98cd', false],
      [null, 'cf7bd22c', false],
      ['f6a12853', '1db58231', true],
      ['7974b2df', '1db58231', false],
    ])
    expect(rows[0]).toMatchObject({ client_id: 'ac16988e', video_id: POST.id, method: 'judge', judge_version: OWN_POST_JUDGE_VERSION, decided_at: NOW, matched_words: ['community involvement', 'litter management'] })
  })

  it('keeps only words the text contains, and a yes with none left is a no', () => {
    expect(rows[4].matched_words).toEqual([])
    expect(rows[4].touches).toBe(false)
    expect(wordsIn('Protect Our Paths: litter management', ['Litter', 'rain', 'paths'])).toEqual(['Litter', 'paths'])
  })

  it('leaves a pair the model did not answer unfiled (no row, so "not checked yet")', () => {
    expect(rows.some((r) => r.claim_id === 'da37c468')).toBe(false)
  })
})

describe('judgePosts, with a mocked model', () => {
  it('calls once per post, prices the call, and files what parses', async () => {
    const call = vi.fn<JudgeCall>(async () => ({ parsed: ANSWER, usage: { prompt_tokens: 900, completion_tokens: 300 }, error: null }))
    const res = await judgePosts({ posts: [POST], subjects: SUBJECTS, clientId: 'ac16988e', call, budgetUsd: 0.2, now: () => NOW, actorLabel: 'test' })
    expect(call).toHaveBeenCalledTimes(1)
    expect(call.mock.calls[0][0].user).toContain('[S1] Community & purpose')
    expect(call.mock.calls[0][0].user).toContain('[C3] The initiative encourages everyone')
    expect(res.rows).toHaveLength(5)
    expect(res.costUsd).toBeCloseTo(0.00084, 6)
    expect(res.failed).toEqual([])
  })

  it('files nothing for a post whose answer does not parse, and stops at the budget', async () => {
    const bad = vi.fn<JudgeCall>(async () => ({ parsed: { decisions: 'no' }, usage: { prompt_tokens: 900, completion_tokens: 300 }, error: null }))
    const res = await judgePosts({ posts: [POST, { ...POST, id: 'p2' }], subjects: SUBJECTS, clientId: 'c', call: bad, budgetUsd: 0.0005, now: () => NOW, actorLabel: 't' })
    expect(res.rows).toEqual([])
    expect(res.failed).toEqual([POST.id])
    expect(res.budgetStopped).toBe(true)
    expect(bad).toHaveBeenCalledTimes(1)
  })

  it('calls nothing with no subject', async () => {
    const call = vi.fn<JudgeCall>()
    expect((await judgePosts({ posts: [POST], subjects: [], clientId: 'c', call, budgetUsd: 1, now: () => NOW, actorLabel: 't' })).calls).toBe(0)
    expect(call).not.toHaveBeenCalled()
  })
})

describe('what is still to judge and to write', () => {
  const held = [{ video_id: POST.id, claim_id: null, subject_id: '1db58231', judge_version: OWN_POST_JUDGE_VERSION, method: 'judge' }]
  it('judges a post until every subject has a post row under this version', () => {
    expect(postsToJudge([{ id: POST.id }], SUBJECTS, held)).toHaveLength(1)
    const all = SUBJECTS.map((s) => ({ ...held[0], subject_id: s.id }))
    expect(postsToJudge([{ id: POST.id }], SUBJECTS, all)).toHaveLength(0)
  })
  it('skips a pair already filed under this version (MF3’s unique index)', () => {
    const rows = judgeRows({ parsed: ANSWER, post: POST, subjects: SUBJECTS, clientId: 'c', decidedAt: NOW, actorLabel: 't' })
    expect(unfiledRows(rows, held)).toHaveLength(rows.length - 1)
  })
})

describe('the prompt and the cost', () => {
  it('reads the caption, topics and a transcript opening, never the whole transcript', () => {
    const long = { ...POST, transcript: 'x '.repeat(2000) }
    expect(postText(long).length).toBeLessThan(POST.caption!.length + 400 + 1300)
    expect(buildJudgeUserPrompt(POST, SUBJECTS)).toContain('THE POST [P]')
  })
  it('prices a three-month window of Sealand’s posts at about five cents', () => {
    // 56 posts over July to September on staging (106 to date since 2021).
    expect(judgeCostEstimate(56)).toBeGreaterThan(0.04)
    expect(judgeCostEstimate(56)).toBeLessThan(0.06)
  })
})

describe('the script’s rules', () => {
  it('reaches the model only with --spend, and writes only with --apply', () => {
    expect(judgeMode({ apply: false, spend: false, fromFile: null })).toBe('plan')
    expect(judgeMode({ apply: false, spend: true, fromFile: null })).toBe('judge')
    expect(judgeMode({ apply: true, spend: true, fromFile: null })).toBe('judge_apply')
    expect(judgeMode({ apply: true, spend: false, fromFile: 'rows.json' })).toBe('apply_file')
    expect(() => judgeMode({ apply: true, spend: false, fromFile: null })).toThrow(/--apply needs --spend/)
    expect(() => judgeMode({ apply: false, spend: false, fromFile: 'rows.json' })).toThrow(/needs --apply/)
    expect(() => judgeMode({ apply: true, spend: true, fromFile: 'rows.json' })).toThrow(/not both/)
  })

  it('reads the three months the page reads by default', () => {
    expect(defaultSince('2026-11-21T10:00:00.000Z')).toBe('2026-09-01')
    expect(defaultSince('2027-01-05T10:00:00.000Z')).toBe('2026-11-01')
  })

  it('writes a file only of this client’s rows under this judge version', () => {
    const rows = judgeRows({ parsed: ANSWER, post: POST, subjects: SUBJECTS, clientId: 'ac16988e', decidedAt: NOW, actorLabel: 't' })
    expect(readRowsFile({ rows }, 'ac16988e')).toHaveLength(5)
    expect(() => readRowsFile({ rows }, 'e52cac94')).toThrow(/row 1/)
    expect(() => readRowsFile({ rows: [{ ...rows[0], judge_version: 'v0' }] }, 'ac16988e')).toThrow()
    expect(() => readRowsFile({}, 'ac16988e')).toThrow(/no "rows"/)
  })
})
