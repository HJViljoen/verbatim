import { describe, expect, it } from 'vitest'

import {
  countRefused,
  refusals,
  discardCaveat,
  halfOpenInstants,
  isMissingThemeMembers,
  howSoundLine,
  isEnglishTag,
  longestGapDays,
  monthRecordWindow,
  platformMixLine,
  recordLines,
  refusedSentence,
  totalPlatformMix,
  totalVideos,
  type RecordInputs,
} from './record'
import type { Verdict } from './verdicts'
import { directionRe } from '../test/copy-contract'

const inputs = (over: Partial<RecordInputs> = {}): RecordInputs => ({
  window: { kind: 'month', from: '2026-09-01', to: '2026-09-30' },
  delivery: { delivered: 3, dates: ['2026-09-01', '2026-09-07', '2026-09-13'], longestGapDays: 6, failed: 0, basis: 'run_clock' },
  coverage: [
    { audience: 'client', videos: 28, comments: 210, platformMix: { tiktok: 12, youtube: 10, instagram: 6 }, dualMention: 2, excludedUndated: 4 },
    { audience: 'industry-other', videos: 366, comments: 4_100, platformMix: { tiktok: 151, youtube: 202, instagram: 76, reddit: 12 }, dualMention: 0, excludedUndated: 31 },
  ],
  readDepth: { analysed: 1_596, speech: 798, translated: 208, onScreenText: 269, unflagged: 0, basis: 'all_time_non_reddit' },
  language: { analysed: 1_596, unknown: 491, english: 730, notEnglish: 375, basis: 'video_speech' },
  discard: { readable: true, judged: 1_700, kept: 1_051, setAside: 649, clearedByHeuristic: 97, gateOff: 0, failedOpen: 0, recordedFrom: '2026-08-23', basis: 'run_clock' },
  instrument: { themesPerVideo: 2.4, themeAttachments: 960, analysedVideos: 400, runId: 'run-1' },
  changes: { inWindow: 1, loggedFrom: '2026-09-15', reconstructed: 9 },
  comparisonsRefused: 2,
  refusals: [
    { state: 'too_little_data' as const, reason: null },
    { state: 'refused' as const, reason: 'clustering_changed' as const },
  ],
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

describe('refusedSentence', () => {
  it('pools the repeats and names every reason', () => {
    expect(refusedSentence([])).toBe('Every comparison this page asked for was drawn.')
    expect(refusedSentence([{ state: 'baseline_forming', reason: null }])).toBe(
      '1 comparison was refused on this page, because there are not enough months behind it yet.',
    )
    expect(
      refusedSentence([
        { state: 'too_little_data', reason: null },
        { state: 'too_little_data', reason: null },
        { state: 'refused', reason: 'rename' },
      ]),
    ).toBe('3 comparisons were refused on this page: 2 because too little was read on one side or both and 1 because the two sides are two names for one rival.')
  })
})

describe('refusals', () => {
  const v = (state: Verdict['state'], reason?: Verdict['refusedReason']): Verdict => ({
    objectKind: 'theme', objectId: 'a', objectLabel: 'A', audience: 'client',
    window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
    value: { k: 1, n: 10 }, changePts: null, bandPts: null, state, flags: [],
    ...(reason ? { refusedReason: reason } : {}),
  })
  it('hands back every comparison that was not drawn, with its reason as a token', () => {
    expect(refusals([v('moved'), v('too_little_data'), v('refused', 'rename'), v('no_clear_change')])).toEqual([
      { state: 'too_little_data', reason: null },
      { state: 'refused', reason: 'rename' },
    ])
  })
})

describe('howSoundLine — one sentence, printed in the open', () => {
  it('is the design’s line', () => {
    expect(howSoundLine(inputs())).toBe(
      '3 updates · 394 videos (YouTube 212 · TikTok 163 · Instagram 82 · Reddit 12) · 34% of what was said on camera was not in English · 1 tracking change',
    )
  })

  it('names no link — the record is a link beside it, not a clause in it', () => {
    // The same string is printed in the band, in the record's own dialog and
    // anywhere a screenshot catches it; only one of those places has a link.
    expect(howSoundLine(inputs())).not.toContain('the record')
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
    // AND THE BASIS IS ON THE LINE. ReadDepthRecord.basis is
    // 'all_time_non_reddit' and this sentence sits between two that both end
    // "in this window".
    expect(has('Of everything we have ever read for you, not just this window')).toBe(true)
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
    const line = recordLines(inputs({ discard: { readable: true, judged: 1_700, kept: 1_051, setAside: 649, clearedByHeuristic: 0, gateOff: 0, failedOpen: 4, recordedFrom: '2026-08-23', basis: 'run_clock' } }))
    expect(line.some((l) => l.includes('4 videos entered without a judgement because the check itself returned none'))).toBe(true)
  })

  it('says nothing at all when nothing went unjudged', () => {
    expect(discardCaveat({ readable: true, judged: 10, kept: 9, setAside: 1, clearedByHeuristic: 0, gateOff: 0, failedOpen: 0, recordedFrom: '2026-08-23', basis: 'run_clock' })).toBe('')
  })

  // The three counts come off `reason`, which M8 withholds from a tenant
  // session. Null is "we did not look", and a caveat built out of it would be a
  // sentence about a column the reader was never allowed to read.
  it('says nothing about the three when the reason column was never read', () => {
    expect(discardCaveat({ readable: true, judged: 10, kept: 9, setAside: 1, clearedByHeuristic: null, gateOff: null, failedOpen: null, recordedFrom: '2026-08-23', basis: 'run_clock' })).toBe('')
  })

  // The failure the research called disqualifying: before M8 a tenant's read of
  // gate_verdicts is EMPTIED by RLS rather than refused, and the old line turned
  // that silence into a confident falsehood about a workspace holding 1,700
  // verdicts.
  it('does not tell a workspace its discards are unrecorded when it simply cannot read them', () => {
    const line = recordLines(inputs({
      discard: { readable: false, judged: 0, kept: 0, setAside: 0, clearedByHeuristic: null, gateOff: null, failedOpen: null, recordedFrom: null, basis: 'run_clock' },
    }))
    expect(line.some((l) => l.includes('is not recorded at all'))).toBe(false)
    expect(line.some((l) => l.includes('we do not yet show it to you'))).toBe(true)
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

  it('names the refusals this render made, WITH their reasons, and says so when it made none', () => {
    // The line used to promise the reason ("and say why in their place") while
    // the why reached the page only as the badge's hover title — invisible in
    // print, dropped in email. It is printed.
    expect(has('2 comparisons were refused on this page: 1 because the two sides were grouped differently and 1 because too little was read on one side or both.')).toBe(true)
    expect(recordLines(inputs({ comparisonsRefused: 0, refusals: [] })).some((l) => l.includes('Every comparison this page asked for was drawn'))).toBe(true)
    expect(recordLines(inputs({ comparisonsRefused: null })).some((l) => l.includes('comparison'))).toBe(false)
  })

  it('prints the reading date on every record', () => {
    expect(has('Reading as at 2026-09-15')).toBe(true)
  })

  it('agrees its verbs with its subjects on both plural paths', () => {
    expect(has('2 comparisons were refused on this page')).toBe(true)
    expect(recordLines(inputs({ comparisonsRefused: 1, refusals: [{ state: 'too_little_data', reason: null }] }))
      .some((l) => l.includes('1 comparison was refused on this page, because too little was read on one side or both.'))).toBe(true)
    expect(recordLines(inputs({ changes: { inWindow: 2, loggedFrom: '2026-09-15', reconstructed: 9 } }))
      .some((l) => l.includes('2 changes to what we track were made inside this window'))).toBe(true)
    expect(has('1 change to what we track was made inside this window')).toBe(true)
  })

  it('counts one theme per video as one theme, not "1 themes"', () => {
    // themesPerVideo is Number(x.toFixed(2)), so an exact 1.00 prints bare.
    expect(recordLines(inputs({ instrument: { themesPerVideo: 1, themeAttachments: 400, analysedVideos: 400, runId: 'r' } }))
      .some((l) => l.includes('1 theme attached per analysed video'))).toBe(true)
    expect(has('2.4 themes attached per analysed video')).toBe(true)
  })

  it('names no direction word — the record is prose, not a verdict', () => {
    // Block rule (c): a direction word outside a verdict node fails the copy
    // contract, and WP9/WP10 render the record into a block. "fell inside this
    // window" was the breach.
    for (const line of recordLines(inputs({ comparisonsRefused: 1, changes: { inWindow: 3, loggedFrom: '2026-09-15', reconstructed: 9 } }))) {
      expect({ line, hits: [...line.matchAll(directionRe())].map((m) => m[0]) }).toEqual({ line, hits: [] })
    }
  })
})

describe('isMissingThemeMembers — "M2 is not applied" and nothing else', () => {
  it('recognises the column and the table before the migration lands', () => {
    expect(isMissingThemeMembers({ code: '42703', message: 'column theme_observations.member_video_ids does not exist' })).toBe(true)
    expect(isMissingThemeMembers({ code: 'PGRST205', message: "Could not find the table 'public.theme_observations' in the schema cache" })).toBe(true)
  })

  it('does not swallow a permission error, a network failure or a query bug', () => {
    expect(isMissingThemeMembers({ code: '42501', message: 'permission denied for table theme_observations' })).toBe(false)
    expect(isMissingThemeMembers(new Error('fetch failed'))).toBe(false)
    expect(isMissingThemeMembers({ code: '42703', message: 'column videos.analyzed_run_id does not exist' })).toBe(false)
    expect(isMissingThemeMembers(null)).toBe(false)
  })
})

describe('monthRecordWindow', () => {
  it('stops at today inside a filling month', () => {
    expect(monthRecordWindow('2026-09-01', '2026-09-18T09:00:00.000Z'))
      .toEqual({ kind: 'month', from: '2026-09-01', to: '2026-09-18' })
  })

  it('ends a closed month on its LAST DAY, never on the first of the next', () => {
    // `to` is inclusive: loadRecordInputs refuses a window whose two ends sit
    // in different months, and loadFrozenAt does .lte('month',
    // monthStartOf(w.to)) — which would pull September's denominator row into
    // August's record. Two pages had written this and one had written
    // '2026-09-01', with a test calling it correct.
    expect(monthRecordWindow('2026-08-01', '2026-09-18T09:00:00.000Z').to).toBe('2026-08-31')
    expect(monthRecordWindow('2026-12-01', '2027-02-01T00:00:00.000Z').to).toBe('2026-12-31')
  })
})

describe('halfOpenInstants — an inclusive day pair for a half-open SQL window', () => {
  it('includes the last day of the window', () => {
    // window_denominators is `comment_date >= p_from and comment_date < p_to`,
    // so September's inclusive 2026-09-30 has to leave here as 1 October.
    expect(halfOpenInstants({ kind: 'month', from: '2026-09-01', to: '2026-09-30' }))
      .toEqual({ from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' })
  })

  it('crosses a month and a year end', () => {
    expect(halfOpenInstants({ kind: 'quarter', from: '2026-10-01', to: '2026-12-31' }).to)
      .toBe('2027-01-01T00:00:00.000Z')
  })

  it('refuses an instant — a HorizonWindow is a whole extra month', () => {
    expect(() => halfOpenInstants({ kind: 'month', from: '2026-09-01', to: '2026-10-01T00:00:00.000Z' }))
      .toThrow(/inclusive YYYY-MM-DD/)
  })
})
