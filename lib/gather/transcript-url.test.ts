import { describe, it, expect } from 'vitest'
import { speechActorFor, speechCandidateKey, speechActorInput, parseSpeechItems, estimateSpeechUsd } from './transcript-url'
import { APIFY_ACTORS } from '../config'

// The platform-URL transcript path (Phase 2 T2.2, 2026-09-09). Every fixture
// below is a REAL item from the live bake-off recorded in
// scratch/transcripts/actor-live-test*.log — including the failures, which are
// the whole reason YouTube is routed to a different actor.

describe('speechActorFor', () => {
  it('routes YouTube to its own actor and IG/TikTok to the media actor', () => {
    // Live 2026-09-09: the media actor SUCCEEDED on an Instagram reel and a
    // TikTok and failed on both YouTube urls tried ("this URL could not be
    // fetched or transcribed"), so YouTube must not be sent to it.
    expect(speechActorFor('youtube')).toEqual({ actor: APIFY_ACTORS.speech.youtube, kind: 'youtube' })
    expect(speechActorFor('instagram')).toEqual({ actor: APIFY_ACTORS.speech.media, kind: 'media' })
    expect(speechActorFor('tiktok')).toEqual({ actor: APIFY_ACTORS.speech.media, kind: 'media' })
    // Reddit posts are text; there is nothing to transcribe from a url.
    expect(speechActorFor('reddit')).toBeNull()
  })
})

describe('speechActorInput', () => {
  it('sends the media actor a url list and no timestamps', () => {
    const input = speechActorInput('media', [
      { video_id: 'a', video_url: 'https://www.instagram.com/p/A/' },
      { video_id: 'b', video_url: 'https://www.tiktok.com/@x/video/1' },
    ])
    expect(input.urls).toEqual(['https://www.instagram.com/p/A/', 'https://www.tiktok.com/@x/video/1'])
    expect(input.timestamps).toBe('none')
  })

  it('turns the AI fallback on for YouTube — the candidates have no captions', () => {
    const input = speechActorInput('youtube', [{ video_id: 'MKhNuxWyvL4', video_url: 'https://www.youtube.com/watch?v=MKhNuxWyvL4' }])
    expect(input.startUrls).toEqual([{ url: 'https://www.youtube.com/watch?v=MKhNuxWyvL4' }])
    expect(input.enableAiFallback).toBe(true)
    expect(input.maxAiMinutes).toBeGreaterThan(0)
    expect(input.skipAiFallbackIfLongerThan).toBeGreaterThan(0)
  })
})

describe('speechCandidateKey', () => {
  it('keys YouTube by video id and everything else by url', () => {
    const v = { video_id: 'MKhNuxWyvL4', video_url: 'https://www.youtube.com/watch?v=MKhNuxWyvL4' }
    // The YouTube actor normalises the url it echoes, so matching on the url we
    // sent would silently drop every item.
    expect(speechCandidateKey('youtube', v)).toBe('MKhNuxWyvL4')
    expect(speechCandidateKey('media', v)).toBe(v.video_url)
  })
})

describe('parseSpeechItems', () => {
  it('reads the media actor: text, language, billed minutes', () => {
    const out = parseSpeechItems('media', [
      {
        url: 'https://www.tiktok.com/@patrickzhaoo/video/7652038036452117768',
        text: 'This is the most underrated backpack for school.',
        language: 'en',
        duration_s: 24.47,
        usage: { minutes: 1, platform_fetch: true },
      },
    ])
    expect(out.get('https://www.tiktok.com/@patrickzhaoo/video/7652038036452117768')).toEqual({
      ok: true, text: 'This is the most underrated backpack for school.', lang: 'en', minutes: 1,
    })
  })

  it('reads the YouTube actor, keyed by metadata.id', () => {
    const out = parseSpeechItems('youtube', [
      {
        metadata: { id: 'MKhNuxWyvL4', url: 'https://www.youtube.com/watch?v=MKhNuxWyvL4', duration: 55 },
        language: 'en',
        is_ai_generated: true,
        ai_duration_charged_min: 1,
        transcript_text: 'A couple of weeks ago I found this purse bar in the river.',
      },
    ])
    expect(out.get('MKhNuxWyvL4')).toEqual({
      ok: true, text: 'A couple of weeks ago I found this purse bar in the river.', lang: 'en', minutes: 1,
    })
  })

  it('keeps a per-item failure as a stated reason, not a silent empty transcript', () => {
    const media = parseSpeechItems('media', [
      { url: 'https://www.youtube.com/watch?v=MKhNuxWyvL4', error: 'this URL could not be fetched or transcribed' },
    ])
    expect(media.get('https://www.youtube.com/watch?v=MKhNuxWyvL4')).toEqual({
      ok: false, error: 'this URL could not be fetched or transcribed',
    })
    const yt = parseSpeechItems('youtube', [
      { metadata: { id: 'h9mF6Mnq2VA' }, error: 'AI transcription failed for this video.', error_code: 'AI_TRANSCRIPTION_FAILED' },
    ])
    expect(yt.get('h9mF6Mnq2VA')).toEqual({ ok: false, error: 'AI transcription failed for this video.' })
    // An item with neither text nor error is still a failure — never ok:true
    // with an empty string, which would be stored as a real transcript.
    const empty = parseSpeechItems('media', [{ url: 'u', text: '   ' }])
    expect(empty.get('u')).toEqual({ ok: false, error: 'actor returned no transcript text' })
  })

  it('skips items that carry no identity at all', () => {
    expect(parseSpeechItems('media', [{ text: 'orphan' }]).size).toBe(0)
    expect(parseSpeechItems('youtube', [{ transcript_text: 'orphan' }]).size).toBe(0)
  })

  it('falls back to the item duration when the actor reports no billed minutes', () => {
    const out = parseSpeechItems('media', [{ url: 'u', text: 'hi there', language: null, duration_s: 90 }])
    expect(out.get('u')).toEqual({ ok: true, text: 'hi there', lang: null, minutes: 1.5 })
  })
})

describe('estimateSpeechUsd', () => {
  it('matches the live bill: one 1-minute video through the media actor', () => {
    // Observed 2026-09-09: $0.0552 settled (start 0.005 + fetch 0.02 +
    // audio-minute 0.03 + $0.0002 compute, which the estimate leaves out).
    expect(estimateSpeechUsd('media', 1, 0.42)).toBeCloseTo(0.055, 4)
  })

  it('pays the run start once, so a batch is cheaper per video', () => {
    const one = estimateSpeechUsd('media', 1, 1)
    const eight = estimateSpeechUsd('media', 8, 8)
    expect(eight).toBeLessThan(one * 8)
  })

  it('bills YouTube per STARTED AI minute', () => {
    // Live run of two YouTube videos, one of which failed: $0.02 settled.
    expect(estimateSpeechUsd('youtube', 1, 0.9)).toBeCloseTo(0.01 + 0.001 + 0.012, 4)
  })

  it('is zero when nothing was transcribed — a failed run must not invent spend', () => {
    expect(estimateSpeechUsd('media', 0, 0)).toBe(0)
    expect(estimateSpeechUsd('youtube', 0, 0)).toBe(0)
  })
})
