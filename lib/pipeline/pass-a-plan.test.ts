import { describe, it, expect } from 'vitest'
import { decideAnalysis, growthThreshold, protectedKeptIds, staleInsightIds, type VideoAnalysisState } from './pass-a-plan'

// Incremental Pass A invariants worth locking (2026-08-17):
//  - flag off ⇒ today's behaviour exactly (every eligible video re-read)
//  - a video is re-read only when something the prompt sees changed: new /
//    comment growth past the rule / transcript landed / lane changed / prompt
//    version bumped / operator force
//  - growth is measured against the count AT LAST ANALYSIS (cumulative), and
//    only for the full lane (the claims lane sends no comments)
//  - the same run never re-reads a video it already produced (resume safety)
//  - staleness = "not the row the video's pointer names"

const state = (over: Partial<VideoAnalysisState> = {}): VideoAnalysisState => ({
  analyzed_run_id: 'run-1',
  analyzed_comment_count: 20,
  analyzed_prompt_version: 'pass_a_v4',
  analyzed_lane: 'full',
  analyzed_with_transcript: false,
  analyzed_with_translation: false,
  analyzed_with_ocr: false,
  ...over,
})

const base = {
  laneNow: 'full' as const,
  storedComments: 20,
  transcriptUsableNow: false,
  translationUsableNow: false,
  ocrUsableNow: false,
  promptVersion: 'pass_a_v4',
  incremental: true,
  force: false,
  runId: 'run-2',
}

describe('growthThreshold', () => {
  it('is min(3, ceil(20%)) with a floor of 1', () => {
    expect(growthThreshold(0)).toBe(1)
    expect(growthThreshold(5)).toBe(1)   // 20% of 5 = 1
    expect(growthThreshold(10)).toBe(2)  // 20% of 10 = 2
    expect(growthThreshold(14)).toBe(3)  // ceil(2.8) = 3
    expect(growthThreshold(15)).toBe(3)
    expect(growthThreshold(100)).toBe(3) // capped by PASS_A_RECHECK_MIN
  })
})

describe('decideAnalysis', () => {
  it('never selects a video that is not analysable now (skip lane), in either mode', () => {
    expect(decideAnalysis({ ...base, state: state(), laneNow: 'skip' })).toEqual({ select: false, reason: 'unchanged' })
    expect(decideAnalysis({ ...base, state: state(), laneNow: 'skip', incremental: false })).toEqual({ select: false, reason: 'unchanged' })
  })

  it('flag off ⇒ every eligible video is re-read (today\'s corpus-wide behaviour)', () => {
    expect(decideAnalysis({ ...base, state: state(), incremental: false })).toEqual({ select: true, reason: 'flag_off' })
    expect(decideAnalysis({ ...base, state: state({ analyzed_run_id: null }), incremental: false })).toEqual({ select: true, reason: 'flag_off' })
  })

  it('never re-reads a video this same run already produced (analysis-only resume)', () => {
    const s = state({ analyzed_run_id: 'run-2' })
    expect(decideAnalysis({ ...base, state: s })).toEqual({ select: false, reason: 'unchanged' })
    expect(decideAnalysis({ ...base, state: s, incremental: false })).toEqual({ select: false, reason: 'unchanged' })
    expect(decideAnalysis({ ...base, state: s, force: true })).toEqual({ select: false, reason: 'unchanged' })
  })

  it('force re-reads everything eligible', () => {
    expect(decideAnalysis({ ...base, state: state(), force: true })).toEqual({ select: true, reason: 'forced' })
  })

  it('a never-analysed video (or a dangling pointer) is new', () => {
    expect(decideAnalysis({ ...base, state: state({ analyzed_run_id: null }) })).toEqual({ select: true, reason: 'new' })
  })

  it('unchanged video is reused', () => {
    expect(decideAnalysis({ ...base, state: state() })).toEqual({ select: false, reason: 'unchanged' })
  })

  it('comment growth past the rule re-reads — cumulative since last analysis', () => {
    expect(decideAnalysis({ ...base, state: state({ analyzed_comment_count: 100 }), storedComments: 103 })).toEqual({ select: true, reason: 'grew' })
    expect(decideAnalysis({ ...base, state: state({ analyzed_comment_count: 100 }), storedComments: 102 })).toEqual({ select: false, reason: 'unchanged' })
    // small video: +1 on 5 is a 20% change of the whole prompt input
    expect(decideAnalysis({ ...base, state: state({ analyzed_comment_count: 5 }), storedComments: 6 })).toEqual({ select: true, reason: 'grew' })
    // +2 on 20 sits under both bars (3 and 20% = 4)
    expect(decideAnalysis({ ...base, state: state({ analyzed_comment_count: 20 }), storedComments: 22 })).toEqual({ select: false, reason: 'unchanged' })
    // shrinkage (comments deleted) is not growth
    expect(decideAnalysis({ ...base, state: state({ analyzed_comment_count: 20 }), storedComments: 12 })).toEqual({ select: false, reason: 'unchanged' })
  })

  it('a usable transcript landing after the last read re-reads', () => {
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: false }), transcriptUsableNow: true })).toEqual({ select: true, reason: 'transcript' })
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: true }), transcriptUsableNow: true })).toEqual({ select: false, reason: 'unchanged' })
  })

  it('a translation landing after the last read re-reads (WP6, no version bump)', () => {
    // The mechanism the 'transcript' reason established, for the second text a
    // video can gain. It is what buys a corpus-wide prompt bump not happening:
    // only the videos that actually gained an English rendering are re-read.
    const s = state({ analyzed_with_transcript: true, analyzed_with_translation: false })
    expect(decideAnalysis({ ...base, state: s, transcriptUsableNow: true, translationUsableNow: true }))
      .toEqual({ select: true, reason: 'translated' })
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: true, analyzed_with_translation: true }), transcriptUsableNow: true, translationUsableNow: true }))
      .toEqual({ select: false, reason: 'unchanged' })
  })

  it('an English video is never re-read for a translation it will never have', () => {
    // translationUsableNow stays false for the ~73% of the corpus that is
    // already English, so analyzed_with_translation false is not a re-read
    // trigger on its own — otherwise every video would re-read every run.
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: true, analyzed_with_translation: false }), transcriptUsableNow: true }))
      .toEqual({ select: false, reason: 'unchanged' })
  })

  it('a transcript and its translation landing together re-read once, as "transcript"', () => {
    // Both are true on a video's first analysis; one re-read covers both, and
    // the reason a run log shows is the one that came first.
    expect(decideAnalysis({ ...base, state: state(), transcriptUsableNow: true, translationUsableNow: true }))
      .toEqual({ select: true, reason: 'transcript' })
  })

  it('rows written before analyzed_with_translation existed re-read once', () => {
    // The column defaults false, but a NULL (an older row, or a backfill that
    // did not touch it) must read as "not analysed with one" rather than as
    // true — otherwise the whole historical non-English corpus silently keeps
    // its untranslated analysis forever.
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: true, analyzed_with_translation: null }), transcriptUsableNow: true, translationUsableNow: true }))
      .toEqual({ select: true, reason: 'translated' })
  })

  it('on-screen text landing after the last read re-reads (WP7b, no version bump)', () => {
    // Third text a video can gain, same mechanism as 'transcript' and
    // 'translated'. This is what buys not bumping the Pass A prompt version for
    // the [o] block: only the videos whose cover actually carried text re-read.
    const s = state({ analyzed_with_transcript: true, analyzed_with_ocr: false })
    expect(decideAnalysis({ ...base, state: s, transcriptUsableNow: true, ocrUsableNow: true }))
      .toEqual({ select: true, reason: 'ocr' })
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: true, analyzed_with_ocr: true }), transcriptUsableNow: true, ocrUsableNow: true }))
      .toEqual({ select: false, reason: 'unchanged' })
  })

  it('a cover with no legible text never re-reads — "none" is an answer', () => {
    // ocrUsableNow is false for 'none' / 'no_image' / 'failed', so those videos
    // cannot re-select forever on an analyzed_with_ocr that will stay false.
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: true, analyzed_with_ocr: false }), transcriptUsableNow: true }))
      .toEqual({ select: false, reason: 'unchanged' })
  })

  it('on-screen text re-reads a SILENT video — the case the feature exists for', () => {
    // No transcript at all, and a cover that is a title card. Nothing else in
    // decideAnalysis would ever have picked this video up.
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: false }), ocrUsableNow: true }))
      .toEqual({ select: true, reason: 'ocr' })
  })

  it('rows written before analyzed_with_ocr existed re-read once', () => {
    expect(decideAnalysis({ ...base, state: state({ analyzed_with_transcript: true, analyzed_with_ocr: null }), transcriptUsableNow: true, ocrUsableNow: true }))
      .toEqual({ select: true, reason: 'ocr' })
  })

  it('a transcript and its cover text landing together re-read once, as "transcript"', () => {
    expect(decideAnalysis({ ...base, state: state(), transcriptUsableNow: true, ocrUsableNow: true }))
      .toEqual({ select: true, reason: 'transcript' })
  })

  it('a lane change re-reads (claims_only → full after crossing the floor)', () => {
    expect(decideAnalysis({ ...base, state: state({ analyzed_lane: 'claims_only', analyzed_with_transcript: true }), transcriptUsableNow: true }))
      .toEqual({ select: true, reason: 'lane' })
  })

  it('a bookkept skip is not re-read every run — only real growth brings it back', () => {
    // Second gate: raw count clears the floor, kept count does not. laneNow is
    // 'full' forever, so the lane rule must NOT fire; growth against the stored
    // raw count decides.
    const skipped = state({ analyzed_lane: 'skip', analyzed_comment_count: 6 })
    expect(decideAnalysis({ ...base, state: skipped, storedComments: 7 })).toEqual({ select: false, reason: 'unchanged' })
    expect(decideAnalysis({ ...base, state: skipped, storedComments: 9 })).toEqual({ select: true, reason: 'grew' })
    // but a transcript landing on a skipped video still re-reads it
    expect(decideAnalysis({ ...base, state: skipped, laneNow: 'claims_only', storedComments: 6, transcriptUsableNow: true }))
      .toEqual({ select: true, reason: 'transcript' })
  })

  it('claims lane ignores comment growth below the floor', () => {
    const s = state({ analyzed_lane: 'claims_only', analyzed_comment_count: 1, analyzed_with_transcript: true })
    expect(decideAnalysis({ ...base, state: s, laneNow: 'claims_only', storedComments: 4, transcriptUsableNow: true }))
      .toEqual({ select: false, reason: 'unchanged' })
  })

  it('a prompt-version bump re-reads once (full re-analysis on the next run)', () => {
    expect(decideAnalysis({ ...base, state: state({ analyzed_prompt_version: 'pass_a_v3' }) })).toEqual({ select: true, reason: 'version' })
  })
})

describe('staleInsightIds', () => {
  const videos = [
    { id: 'v1', analyzed_run_id: 'run-2' },
    { id: 'v2', analyzed_run_id: null },
  ]
  it('keeps rows the pointer names and flags everything else', () => {
    const rows = [
      { id: 'a', run_id: 'run-2', source_video_id: 'v1' }, // current
      { id: 'b', run_id: 'run-1', source_video_id: 'v1' }, // superseded by run-2
      { id: 'c', run_id: 'run-1', source_video_id: 'v2' }, // video has no pointer
      { id: 'd', run_id: null, source_video_id: 'v1' },    // its run was deleted
      { id: 'e', run_id: 'run-2', source_video_id: null }, // no source video
      { id: 'f', run_id: 'run-2', source_video_id: 'v9' }, // unknown video
    ]
    expect(staleInsightIds(videos, rows)).toEqual(['b', 'c', 'd', 'e', 'f'])
  })
  it('returns nothing when everything is current', () => {
    expect(staleInsightIds(videos, [{ id: 'a', run_id: 'run-2', source_video_id: 'v1' }])).toEqual([])
  })

  // ── cited evidence survives re-analysis (2026-09-18) ────────────────────────
  //
  // The defect these pin: all twelve of Sealand's oldest recommendations cited
  // audience_insights rows this function had already returned, so the ledger's
  // "Grounded in" column read zero live videos down the whole page. A row that
  // something stored still points at is not stale merely because a later run
  // re-read its video.
  describe('the protected set', () => {
    const rows = [
      { id: 'a', run_id: 'run-2', source_video_id: 'v1' }, // current
      { id: 'b', run_id: 'run-1', source_video_id: 'v1' }, // superseded by run-2
      { id: 'c', run_id: 'run-1', source_video_id: 'v2' }, // video has no pointer
      { id: 'd', run_id: null, source_video_id: 'v1' },    // its run was deleted
      { id: 'e', run_id: 'run-2', source_video_id: null }, // no source video
      { id: 'f', run_id: 'run-2', source_video_id: 'v9' }, // unknown video
    ]

    it('never returns a protected id, though its video pointer has moved on', () => {
      expect(staleInsightIds(videos, rows, new Set(['b']))).toEqual(['c', 'd', 'e', 'f'])
    })

    it('still returns an unprotected superseded row — the set narrows, it does not disable', () => {
      const stale = staleInsightIds(videos, rows, new Set(['b']))
      expect(stale).toContain('c')
      expect(stale).not.toContain('b')
    })

    // The four non-pointer reasons a row is stale are each an id-level
    // decision, so protection has to beat all four and not only the common
    // one: a snapshot's frozen quote ref can name a row whose run has since
    // been deleted, and dropping that row empties a stored export.
    it('protects a row whose run was deleted, whose video is unknown, or which has no source video', () => {
      expect(staleInsightIds(videos, rows, new Set(['c', 'd', 'e', 'f']))).toEqual(['b'])
    })

    it('a null run_id or a null source_video_id is still stale when NOT protected', () => {
      expect(staleInsightIds(videos, rows, new Set(['b']))).toEqual(expect.arrayContaining(['d', 'e']))
    })

    // Regression guard on the existing signature: the third argument is
    // optional, and the two empty forms must behave exactly as the call did
    // before it existed, or an untouched caller changes meaning in silence.
    it('the omitted and empty-set calls are identical to today', () => {
      const today = ['b', 'c', 'd', 'e', 'f']
      expect(staleInsightIds(videos, rows)).toEqual(today)
      expect(staleInsightIds(videos, rows, new Set())).toEqual(today)
      expect(staleInsightIds(videos, rows, undefined)).toEqual(today)
    })

    it('protecting a row that is already current changes nothing', () => {
      expect(staleInsightIds(videos, rows, new Set(['a']))).toEqual(['b', 'c', 'd', 'e', 'f'])
    })

    it('an id in the protected set that names no row is simply ignored', () => {
      expect(staleInsightIds(videos, rows, new Set(['not-a-row']))).toEqual(['b', 'c', 'd', 'e', 'f'])
    })

    it('protecting everything returns nothing at all', () => {
      expect(staleInsightIds(videos, rows, new Set(rows.map((r) => r.id)))).toEqual([])
    })
  })
})

// What the protection COST, which the operator log prints and which is a
// different question from how many ids the citation walk found: a cited id can
// name a row that is current anyway, or one this tenant no longer has.
describe('protectedKeptIds', () => {
  const videos = [
    { id: 'v1', analyzed_run_id: 'run-2' },
    { id: 'v2', analyzed_run_id: null },
  ]
  const rows = [
    { id: 'a', run_id: 'run-2', source_video_id: 'v1' }, // current
    { id: 'b', run_id: 'run-1', source_video_id: 'v1' }, // superseded by run-2
    { id: 'c', run_id: 'run-1', source_video_id: 'v2' }, // video has no pointer
    { id: 'd', run_id: null, source_video_id: 'v1' },    // its run was deleted
  ]

  it('counts only the protected rows that would otherwise have been deleted', () => {
    expect(protectedKeptIds(videos, rows, new Set(['b', 'd']))).toEqual(['b', 'd'])
  })

  it('does not count a protected row that is current anyway', () => {
    expect(protectedKeptIds(videos, rows, new Set(['a', 'b']))).toEqual(['b'])
  })

  it('ignores a protected id this tenant has no row for', () => {
    expect(protectedKeptIds(videos, rows, new Set(['not-a-row']))).toEqual([])
  })

  it('is empty for the omitted and empty-set calls', () => {
    expect(protectedKeptIds(videos, rows)).toEqual([])
    expect(protectedKeptIds(videos, rows, new Set())).toEqual([])
  })

  // The identity the operator log used to compute by subtraction, pinned so the
  // cheaper form cannot drift from it.
  it('equals the difference between the unprotected and protected selections', () => {
    const protectedIds = new Set(['b', 'c'])
    const withOut = staleInsightIds(videos, rows).length
    const withIn = staleInsightIds(videos, rows, protectedIds).length
    expect(protectedKeptIds(videos, rows, protectedIds)).toHaveLength(withOut - withIn)
  })
})
