import { describe, it, expect } from 'vitest'
import {
  needsTranscriptAttempt,
  transcriptPreconditionMet,
  planBackfillBatches,
  emptyBackfillTally,
  mergeTallies,
  type BackfillCandidate,
} from './transcript-backfill'
import { TRANSCRIPT_MAX_ATTEMPTS } from '../config'

// The transcript precondition (Phase 2 T2.3, 2026-09-09). What is locked here:
//  - which statuses are a VERDICT on the audio (never retried) and which are an
//    absence or an error (retried until the attempt budget is spent)
//  - 'failed' is not terminal until TRANSCRIPT_MAX_ATTEMPTS
//  - the rule analysis rests on, stated as one predicate

const v = (over: Partial<BackfillCandidate> = {}): BackfillCandidate => ({
  id: 'uuid', platform: 'instagram', video_id: 'vid', video_url: 'https://www.instagram.com/p/A/',
  transcript_status: null, transcript_attempts: 0, ...over,
})

describe('needsTranscriptAttempt', () => {
  it('retries the never-attempted — the 468 Sealand Instagram videos', () => {
    expect(needsTranscriptAttempt(v({ transcript_status: null }))).toBe(true)
  })

  it('retries a failure until its attempts are spent', () => {
    expect(needsTranscriptAttempt(v({ transcript_status: 'failed', transcript_attempts: 0 }))).toBe(true)
    expect(needsTranscriptAttempt(v({ transcript_status: 'failed', transcript_attempts: TRANSCRIPT_MAX_ATTEMPTS - 1 }))).toBe(true)
    // Spent: 'failed' is terminal again, which is what stops a video costing
    // money on every run forever.
    expect(needsTranscriptAttempt(v({ transcript_status: 'failed', transcript_attempts: TRANSCRIPT_MAX_ATTEMPTS }))).toBe(false)
    expect(needsTranscriptAttempt(v({ transcript_status: null, transcript_attempts: TRANSCRIPT_MAX_ATTEMPTS }))).toBe(false)
  })

  it('never re-asks about audio that was heard', () => {
    // These are verdicts, not absences: the provider heard the audio and there
    // was no usable speech. Asking again returns the same answer and bills for
    // it.
    for (const status of ['ok', 'no_speech', 'lyrics', 'garbled']) {
      expect(needsTranscriptAttempt(v({ transcript_status: status })), status).toBe(false)
    }
  })

  it("treats YouTube's no_media as 'no captions', not 'no audio'", () => {
    // The caption actor returns no_media when a video has no caption track; the
    // AI-fallback actor can still transcribe it. Everywhere else no_media means
    // the ITEM had no media (a photo post) — there is nothing to hear.
    expect(needsTranscriptAttempt(v({ platform: 'youtube', transcript_status: 'no_media', video_url: 'https://www.youtube.com/watch?v=x' }))).toBe(true)
    expect(needsTranscriptAttempt(v({ platform: 'instagram', transcript_status: 'no_media' }))).toBe(false)
    expect(needsTranscriptAttempt(v({ platform: 'tiktok', transcript_status: 'no_media' }))).toBe(false)
  })

  it('needs a url to ask about, and a platform with something to transcribe', () => {
    expect(needsTranscriptAttempt(v({ video_url: null }))).toBe(false)
    // Reddit posts are text — their transcript is the selftext, already stored.
    expect(needsTranscriptAttempt(v({ platform: 'reddit', video_url: 'https://reddit.com/r/x/1' }))).toBe(false)
  })
})

describe('transcriptPreconditionMet — the rule analysis rests on', () => {
  it('is met by a usable transcript', () => {
    expect(transcriptPreconditionMet(v({ transcript_status: 'ok' }), false)).toBe(true)
  })

  it('is met by an attempt this run, whatever it returned', () => {
    // "Asked and came back empty" is a complete answer; the video enters
    // analysis knowing it has no words of its own.
    expect(transcriptPreconditionMet(v({ transcript_status: 'failed' }), true)).toBe(true)
    expect(transcriptPreconditionMet(v({ transcript_status: null }), true)).toBe(true)
  })

  it('is met when no attempt is possible any more', () => {
    expect(transcriptPreconditionMet(v({ transcript_status: 'no_speech' }), false)).toBe(true)
    expect(transcriptPreconditionMet(v({ transcript_status: 'failed', transcript_attempts: TRANSCRIPT_MAX_ATTEMPTS }), false)).toBe(true)
    expect(transcriptPreconditionMet(v({ video_url: null }), false)).toBe(true)
  })

  it('is NOT met when nobody ever asked and asking is still possible', () => {
    // The state this whole phase exists to eliminate.
    expect(transcriptPreconditionMet(v({ transcript_status: null }), false)).toBe(false)
    expect(transcriptPreconditionMet(v({ transcript_status: 'failed', transcript_attempts: 1 }), false)).toBe(false)
  })
})

describe('planBackfillBatches', () => {
  it('keeps only what needs an attempt, richest-first, chunked per platform', () => {
    const batches = planBackfillBatches(
      [
        v({ id: '1', video_id: 'a', comments_count: 10 }),
        v({ id: '2', video_id: 'b', comments_count: 90 }),
        v({ id: '3', video_id: 'c', transcript_status: 'ok', comments_count: 500 }),
        v({ id: '4', video_id: 'd', comments_count: 50 }),
      ],
      { batchSize: 2 },
    )
    expect(batches).toHaveLength(2)
    expect(batches[0].videos.map((x) => x.video_id)).toEqual(['b', 'd'])
    expect(batches[1].videos.map((x) => x.video_id)).toEqual(['a'])
  })

  it('never mixes platforms in one batch — one batch is one actor call', () => {
    const batches = planBackfillBatches(
      [
        v({ id: '1', video_id: 'ig', platform: 'instagram' }),
        v({ id: '2', video_id: 'tt', platform: 'tiktok', video_url: 'https://www.tiktok.com/@x/video/1' }),
      ],
      { batchSize: 8 },
    )
    expect(batches.map((b) => b.platform)).toEqual(['instagram', 'tiktok'])
    expect(batches.every((b) => b.videos.length === 1)).toBe(true)
  })

  it('gives YouTube smaller batches — its actor is ~4x slower per video', () => {
    const ids = [1, 2, 3, 4].map((n) =>
      v({ id: `${n}`, video_id: `y${n}`, platform: 'youtube', video_url: `https://www.youtube.com/watch?v=y${n}`, transcript_status: 'no_media' }),
    )
    const batches = planBackfillBatches(ids, { batchSize: 8, youtubeBatchSize: 2 })
    expect(batches.map((b) => b.videos.length)).toEqual([2, 2])
  })

  it('plans nothing when every video is settled', () => {
    expect(planBackfillBatches([v({ transcript_status: 'ok' }), v({ transcript_status: 'lyrics' })])).toEqual([])
  })
})

describe('mergeTallies', () => {
  it('adds every counter and invents none', () => {
    const a = { ...emptyBackfillTally(), attempted: 3, ok: 2, failed: 1 }
    const b = { ...emptyBackfillTally(), attempted: 2, no_speech: 2 }
    expect(mergeTallies(a, b)).toEqual({ attempted: 5, ok: 2, no_speech: 2, lyrics: 0, garbled: 0, failed: 1, no_media: 0 })
  })
})
