import { describe, expect, it } from 'vitest'

import { PRIVACY_LINE as WEEK_PRIVACY_LINE } from '../pages/week'
import { REDDIT_COMMENT_DEPTH_CAP } from '../config'
import { methodLines, platformShareLine, PRIVACY_LINE, REDDIT_CAP_LINE } from './method'
import type { RecordInputs } from './record'

// The method footnote (block D, D9). What these tests hold is the BASIS rule:
// three of the five facts are on three different clocks, and each one has to
// say which it is on. A footnote that reads as one paragraph about one month is
// the defect — "27% of this month's videos are not in English" is two errors in
// one clause, the period and the subject.

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
  refusals: [],
  readingAt: '2026-09-15T10:30:00.000Z',
  frozenAt: null,
  ...over,
})

describe('platformShareLine', () => {
  it('prints shares of the pooled total, largest first, every platform named', () => {
    expect(platformShareLine({ tiktok: 163, youtube: 212, instagram: 82, reddit: 43 })).toBe(
      'YouTube 42% · TikTok 33% · Instagram 16% · Reddit 9%',
    )
  })

  it('is empty rather than a row of dashes when nothing was read', () => {
    expect(platformShareLine({})).toBe('')
    expect(platformShareLine({ tiktok: 0 })).toBe('')
  })
})

describe('methodLines', () => {
  it('composes every line, in print order', () => {
    const m = methodLines(inputs(), { brand: 'Sealand' })
    expect(m.preparedBy).toBe('Prepared for Sealand with Verbatim · 15 Sep 2026.')
    expect(m.lines).toEqual([m.preparedBy, m.coverage, m.basis, m.language, m.redditCap, m.privacy])
    for (const line of m.lines) expect(line.length).toBeGreaterThan(0)
    // EVERY ITEM TERMINATES. The consumers join `lines` with a bare space, so
    // an item without a full stop runs into the next one: "18 Sep 2026 2,359
    // videos read in this window" is one garbled number at 9.5px mono. Two of
    // these six had no terminator.
    for (const line of m.lines) expect(line.endsWith('.')).toBe(true)
    expect(m.lines.join(' ')).not.toMatch(/2026 [0-9]/)
  })

  it('names Verbatim alone when no workspace is given', () => {
    expect(methodLines(inputs()).preparedBy).toBe('Prepared by Verbatim · 15 Sep 2026.')
  })

  it('states the coverage as the WINDOW’s, with the mix as shares', () => {
    const m = methodLines(inputs())
    expect(m.coverage).toBe('394 videos read in this window · YouTube 45% · TikTok 35% · Instagram 17% · Reddit 3%.')
  })

  it('reads the reading date off the record, and takes an override', () => {
    expect(methodLines(inputs(), { readingAt: '2026-10-02T00:00:00.000Z' }).preparedBy).toContain('2 Oct 2026')
  })

  it('carries the read-depth basis with the read-depth figures, never a month', () => {
    const m = methodLines(inputs())
    expect(m.basis).toContain('Of everything we have ever read for you, not just this window')
    expect(m.basis).toContain('Reddit excluded')
    // The all-time basis must never be printed under a month heading: no line
    // of this footnote may date the read-depth share to the window it is
    // printed beside.
    expect(m.basis).not.toMatch(/this month|September|Sep 2026/)
  })

  it('states the language share is about what was said on camera, with its k of n', () => {
    const m = methodLines(inputs())
    expect(m.language).toBe(
      '34% of what was said on camera was not in English: 375 of 1,105 videos whose language we know, and 491 with no language recorded at all.',
    )
  })

  it('draws no language line where no language was ever recorded', () => {
    const m = methodLines(inputs({ language: { analysed: 1_596, unknown: 1_596, english: 0, notEnglish: 0, basis: 'video_speech' } }))
    expect(m.language).toBeNull()
    expect(m.lines).not.toContain(null)
    expect(m.lines).toHaveLength(5)
  })

  it('prints the Reddit cap from the constant the gather spends', () => {
    expect(methodLines(inputs()).redditCap).toContain(`capped at ${REDDIT_COMMENT_DEPTH_CAP} per thread`)
    // ONE SENTENCE, TWO HOMES. Settings prints it under the watched-communities
    // table, where the post and comment counts it qualifies are; the footnote
    // prints it as a line. Two wordings of one cap is how a client comes to
    // believe they are two rules.
    expect(methodLines(inputs()).redditCap).toBe(REDDIT_CAP_LINE)
  })

  it('prints the privacy sentence, identical to This week’s', () => {
    expect(methodLines(inputs()).privacy).toBe(PRIVACY_LINE)
    // ONE SENTENCE, TWO HOMES, PINNED EQUAL. See the constant's own note in
    // method.ts: a drift here means two surfaces promising two different things
    // about a commenter's identity.
    expect(PRIVACY_LINE).toBe(WEEK_PRIVACY_LINE)
  })

  it('says the month tables are not recorded rather than printing a zero', () => {
    const m = methodLines(inputs({ coverage: null }))
    expect(m.coverage).toBe('How much was read month by month is not recorded for this workspace yet.')
  })

  it('tells a workspace with nothing in the window from one with no reading at all', () => {
    expect(methodLines(inputs({ coverage: [] })).coverage).toBe('Nothing was read in this window.')
  })

  it('says how much of each video was read is unrecorded rather than 0%', () => {
    const m = methodLines(inputs({ readDepth: { analysed: 0, speech: 0, translated: 0, onScreenText: 0, unflagged: 0, basis: 'all_time_non_reddit' } }))
    expect(m.basis).toBe('How much of each video we managed to read is not recorded yet.')
    expect(m.basis).not.toContain('0%')
  })
})
