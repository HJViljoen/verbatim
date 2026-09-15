import { describe, expect, it } from 'vitest'

import {
  countRefused,
  discardCaveat,
  howSoundLine,
  isEnglishTag,
  longestGapDays,
  platformMixLine,
  recordLines,
  totalPlatformMix,
  totalVideos,
  type RecordInputs,
} from './record'
import type { Verdict } from './verdicts'

const inputs = (over: Partial<RecordInputs> = {}): RecordInputs => ({
  window: { kind: 'month', from: '2026-09-01', to: '2026-09-30' },
  delivery: { delivered: 3, dates: ['2026-09-01', '2026-09-07', '2026-09-13'], longestGapDays: 6, unfinished: 0, basis: 'run_clock' },
  coverage: [
    { audience: 'client', videos: 28, comments: 210, platformMix: { tiktok: 12, youtube: 10, instagram: 6 }, dualMention: 2, excludedUndated: 4 },
    { audience: 'industry-other', videos: 366, comments: 4_100, platformMix: { tiktok: 151, youtube: 202, instagram: 76, reddit: 12 }, dualMention: 0, excludedUndated: 31 },
  ],
  readDepth: { analysed: 1_596, speech: 798, translated: 208, onScreenText: 269, unflagged: 0, basis: 'all_time_non_reddit' },
  language: { analysed: 1_596, unknown: 491, english: 730, notEnglish: 375, basis: 'video_speech' },
  discard: { judged: 1_700, kept: 1_051, setAside: 649, clearedByHeuristic: 97, gateOff: 0, failedOpen: 0, recordedFrom: '2026-08-23', basis: 'run_clock' },
  instrument: { themesPerVideo: 2.4, themeAttachments: 960, analysedVideos: 400, runId: 'run-1' },
  changes: { inWindow: 1, loggedFrom: '2026-09-15', reconstructed: 9 },
  comparisonsRefused: 2,
  readingAt: '2026-09-15T10:30:00.000Z',
  frozenAt: null,
  ...over,
})

describe('longestGapDays', () => {
  it('is null under two updates, because one update has no gap', () => {
    expect(longestGapDays([])).toBeNull()
    expect(longestGapDays(['2026-09-01T00:00:00Z'])).toBeNull()
  })
  it('is the longest stretch between two deliveries, in whole days', () => {
    expect(longestGapDays(['2026-09-01T00:00:00Z', '2026-09-07T00:00:00Z', '2026-09-09T00:00:00Z'])).toBe(6)
  })
})

describe('isEnglishTag — the column is not a clean vocabulary', () => {
  it('reads both spellings and the regional tags', () => {
    for (const t of ['en', 'EN', 'english', 'English', 'en-US', 'en_GB']) expect(isEnglishTag(t)).toBe(true)
  })
  it('does not read an unknown as English, or as not-English either', () => {
    // Null is neither: the three-way split is the whole point of the record.
    expect(isEnglishTag(null)).toBe(false)
    expect(isEnglishTag('nynorsk')).toBe(false)
  })
})

describe('the pooled window figures', () => {
  it('sums videos across audiences, which is exact — an audience is a partition', () => {
    expect(totalVideos(inputs().coverage!)).toBe(394)
  })
  it('names every platform, largest first', () => {
    expect(platformMixLine(totalPlatformMix(inputs().coverage!))).toBe('YouTube 212 · TikTok 163 · Instagram 82 · Reddit 12')
  })
  it('omits a platform with nothing in it rather than printing a zero', () => {
    expect(platformMixLine({ tiktok: 3, reddit: 0 })).toBe('TikTok 3')
  })
})

describe('countRefused', () => {
  const v = (state: Verdict['state']): Verdict => ({
    objectKind: 'theme', objectId: 'a', objectLabel: 'A', audience: 'client',
    window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
    value: { k: 1, n: 10 }, changePts: null, bandPts: null, state, flags: [],
  })
  it('counts every comparison the product declined to answer, whatever the reason', () => {
    expect(countRefused([v('moved'), v('no_clear_change'), v('too_little_data'), v('refused'), v('baseline_forming')])).toBe(3)
  })
})

describe('howSoundLine — one line, one counter, opening to the record', () => {
  it('is the design’s line', () => {
    expect(howSoundLine(inputs())).toBe(
      '3 updates · 394 videos (YouTube 212 · TikTok 163 · Instagram 82 · Reddit 12) · 34% of what was said on camera was not in English · 1 tracking change → the record',
    )
  })

  it('states the non-English share against what is KNOWN, not against everything', () => {
    // 375 of the 1,105 whose language was recorded, not 375 of 1,596: unknown
    // is not non-English, and 491 of Össur's analysed videos have no language.
    expect(howSoundLine(inputs())).toContain('34%')
  })

  it('says the reading is not recorded rather than printing a zero', () => {
    expect(howSoundLine(inputs({ coverage: null }))).toContain('coverage not recorded yet')
  })

  it('drops the tracking-change clause when nothing changed', () => {
    expect(howSoundLine(inputs({ changes: { inWindow: 0, loggedFrom: '2026-09-15', reconstructed: 0 } }))).not.toContain('tracking change')
  })
})

describe('recordLines — every fact with its basis', () => {
  const lines = recordLines(inputs())
  const has = (fragment: string) => lines.some((l) => l.includes(fragment))

  it('prints the three read-depth shares and names the exclusion', () => {
    expect(has('speech was read on 50%, translated on 13%, and on-screen text read on 17%')).toBe(true)
    expect(has('Reddit excluded, which has neither audio nor a cover frame')).toBe(true)
  })

  it('carries the discard record’s late start, because no month before it can show one', () => {
    expect(has('38% of what was looked at was set aside, recorded only from 2026-08-23')).toBe(true)
  })

  // `source: 'default'` is three facts wearing one value, and the record used
  // to say the worst of the three about all of them. All 295 production rows
  // are the heuristic clearing a video, which is the gate working.
  it('does not call a heuristic clearance a video that entered unjudged', () => {
    expect(has('97 videos passed the quick check and were never looked at more closely')).toBe(true)
    expect(has('entered without a judgement')).toBe(false)
  })

  it('says it plainly when the check really did return nothing', () => {
    const line = recordLines(inputs({ discard: { judged: 1_700, kept: 1_051, setAside: 649, clearedByHeuristic: 0, gateOff: 0, failedOpen: 4, recordedFrom: '2026-08-23', basis: 'run_clock' } }))
    expect(line.some((l) => l.includes('4 videos entered without a judgement because the check itself returned none'))).toBe(true)
  })

  it('says nothing at all when nothing went unjudged', () => {
    expect(discardCaveat({ judged: 10, kept: 9, setAside: 1, clearedByHeuristic: 0, gateOff: 0, failedOpen: 0, recordedFrom: '2026-08-23', basis: 'run_clock' })).toBe('')
  })

  it('says outright that the comment language is not recorded', () => {
    expect(has('the comments have no language of their own recorded yet')).toBe(true)
  })

  it('prints the change log’s own boundary and how much of it was reconstructed', () => {
    expect(has('No change record before 2026-09-15')).toBe(true)
    expect(has('9 entries were reconstructed from what each update searched')).toBe(true)
  })

  it('counts the dual mentions and the undated comments the months left out', () => {
    expect(has('2 videos of your own named a tracked rival')).toBe(true)
    expect(has('35 comments carried no date and are in no month')).toBe(true)
  })

  it('says a month is still filling rather than inventing a freeze date', () => {
    expect(has('No month in this window has been frozen yet')).toBe(true)
    expect(recordLines(inputs({ frozenAt: '2026-08-31T00:00:00.000Z' })).some((l) => l.includes('frozen 2026-08-31'))).toBe(true)
  })

  it('says "not recorded" for the instrument figure nothing has ever computed', () => {
    const out = recordLines(inputs({ instrument: { themesPerVideo: null, themeAttachments: 0, analysedVideos: 0, runId: null } }))
    expect(out.some((l) => l.includes('has not been recorded yet'))).toBe(true)
    // Never 0: "nobody measured it" and "it attached nothing" are two answers.
    expect(out.some((l) => l.includes('0 themes attached'))).toBe(false)
  })

  it('names the refusals this render made, and says so when it made none', () => {
    expect(has('2 comparisons on this page could not be drawn')).toBe(true)
    expect(recordLines(inputs({ comparisonsRefused: 0 })).some((l) => l.includes('Every comparison this page asked for could be drawn'))).toBe(true)
    expect(recordLines(inputs({ comparisonsRefused: null })).some((l) => l.includes('comparison'))).toBe(false)
  })

  it('prints the reading date on every record', () => {
    expect(has('Reading as at 2026-09-15')).toBe(true)
  })
})
