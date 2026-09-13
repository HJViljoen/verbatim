import { describe, it, expect } from 'vitest'
import { buildGateVerdictRows, stripLoneSurrogates } from './gate-verdicts'
import type { RelevanceCandidate, RelevanceVerdict } from './relevance'

const cand = (video_id: string, over: Partial<RelevanceCandidate> = {}): RelevanceCandidate =>
  ({ video_id, account_name: 'acct', caption: 'a caption', hashtags: [], ...over } as RelevanceCandidate)

const CLIENT = 'c1'
const RUN = 'r1'

describe('buildGateVerdictRows (Tier 1)', () => {
  it('records the dropped video, which today leaves no trace anywhere', () => {
    const verdicts = new Map<string, RelevanceVerdict>([
      ['v1', { relevant: false, reason: 'off-market term "cosplay"', source: 'heuristic' }],
    ])
    const [row] = buildGateVerdictRows(CLIENT, RUN, 'tiktok', [cand('v1')], verdicts)
    expect(row).toMatchObject({ kept: false, source: 'heuristic', reason: 'off-market term "cosplay"', platform: 'tiktok' })
  })

  it('marks a candidate NOBODY judged as a fail-open keep', () => {
    // The gate fails open three ways: a batch that threw, a short verdict
    // array, an out-of-range index. All of them silently keep the video, and
    // none of them was countable before.
    const [row] = buildGateVerdictRows(CLIENT, RUN, 'tiktok', [cand('v9')], new Map())
    expect(row.kept).toBe(true)
    expect(row.source).toBe('default')
    expect(row.reason).toContain('failed open')
  })

  it('matches the live keep rule: anything not explicitly dropped is kept', () => {
    const verdicts = new Map<string, RelevanceVerdict>([
      ['v1', { relevant: true, reason: 'on-market', source: 'gpt' }],
    ])
    const rows = buildGateVerdictRows(CLIENT, RUN, 'tiktok', [cand('v1'), cand('v2')], verdicts)
    expect(rows.map((r) => r.kept)).toEqual([true, true])
    expect(rows.map((r) => r.source)).toEqual(['gpt', 'default'])
  })

  it('truncates the caption rather than duplicating the corpus', () => {
    const [row] = buildGateVerdictRows(CLIENT, RUN, 'tiktok', [cand('v1', { caption: 'x'.repeat(500) })], new Map())
    expect(row.caption_excerpt).toHaveLength(200)
  })

  it('carries the surfacing keyword so survival can be read per keyword', () => {
    // `freitag` survives at 16.2% and `sealandgear` — the client's own handle —
    // at 16.1%; per-keyword attribution is how that gets diagnosed.
    const [row] = buildGateVerdictRows(CLIENT, RUN, 'tiktok', [cand('v1')], new Map(), () => 'freitag')
    expect(row.keyword).toBe('freitag')
  })

  it('tolerates a missing caption and a null run', () => {
    const [row] = buildGateVerdictRows(CLIENT, null, 'reddit', [cand('v1', { caption: undefined })], new Map())
    expect(row.caption_excerpt).toBeNull()
    expect(row.run_id).toBeNull()
  })
})

describe('buildGateVerdictRows — JSON-safe text (run d346b0f7, 2026-09-13)', () => {
  // Two 22P02s ('invalid input syntax for type json' / "Unicode low surrogate
  // must follow a high surrogate") lost tiktok's and instagram's ENTIRE gate
  // record for the run — 269 verdicts, nothing in pipeline_runs.errors, status
  // 'completed'. Cause: the excerpt slice counts UTF-16 code units, so a caption
  // whose 200th unit is the first half of an emoji ends on a lone surrogate.
  const PAIR = '\u{1F9BF}' // prosthetic leg — two code units, and an Össur caption staple

  it('does not cut an emoji in half at the excerpt boundary', () => {
    // 'x' * 199 + the emoji: the old slice(0, 200) kept 199 x's + the HIGH half.
    const caption = 'x'.repeat(199) + PAIR + 'tail'
    const [row] = buildGateVerdictRows(CLIENT, RUN, 'tiktok', [cand('v1', { caption })], new Map())
    expect(JSON.parse(JSON.stringify(row)).caption_excerpt).toBe(row.caption_excerpt)
    expect(row.caption_excerpt).toBe('x'.repeat(199))
    expect(row.caption_excerpt).toHaveLength(199)
  })

  it('keeps a WHOLE emoji that fits inside the excerpt', () => {
    const [row] = buildGateVerdictRows(CLIENT, RUN, 'tiktok', [cand('v1', { caption: `love this ${PAIR}` })], new Map())
    expect(row.caption_excerpt).toBe(`love this ${PAIR}`)
  })

  it('strips a lone surrogate that arrives in the scraped value itself', () => {
    const rows = buildGateVerdictRows(
      CLIENT, RUN, 'tiktok',
      [cand('v1', { caption: `broken \uD83D here`, account_name: `acct\uDC9F` })],
      new Map([['v1', { relevant: false, reason: 'off-market \uD800', source: 'gpt' } as RelevanceVerdict]]),
      () => 'kw\uDFFF',
    )
    expect(rows[0]).toMatchObject({
      caption_excerpt: 'broken  here',
      account_name: 'acct',
      reason: 'off-market ',
      keyword: 'kw',
    })
  })

  it('every text field survives a Postgres-style JSON round trip', () => {
    // The assertion that matters: no \uD800-\uDFFF left anywhere in the payload,
    // which is precisely what json_to_recordset refuses.
    const rows = buildGateVerdictRows(
      CLIENT, RUN, 'instagram',
      [cand('v1', { caption: 'a'.repeat(199) + PAIR }), cand('v2', { caption: `\uDC00${PAIR}\uD83D` })],
      new Map(),
    )
    expect(JSON.stringify(rows)).not.toMatch(/\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])/i)
    for (const r of rows) expect(stripLoneSurrogates(r.caption_excerpt ?? '')).toBe(r.caption_excerpt ?? '')
  })
})
