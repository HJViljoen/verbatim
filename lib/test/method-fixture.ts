import { methodLines, type MethodLines } from '../reading/method'
import type { RecordInputs } from '../reading/record'

// The method footnote's two fixture states, in ONE place (block D, D9).
//
// Six page fixtures gained `method`, and a footnote hand-written six times is
// six chances for one of them to state the language share on the wrong basis —
// which is the exact defect the field exists to end. Both states are composed
// by the real `methodLines`, over a `RecordInputs` shaped like Sealand's, so a
// fixture can never print a sentence the composer would not.
//
// The refused state is the DEGRADED one, and it is reachable two ways rather
// than one: `loadCoverage` returns null where the month tables cannot be read
// AND where a window spans months without M3's windowed function, so a footnote
// with no coverage line is not by itself evidence about which tenant is in
// which state. Whether either live tenant is in it today is a question for the
// database, not for this comment — nothing here has measured it. What the
// fixture is for is the shape: with no coverage and no language on record, the
// footnote falls to the three lines it can still stand behind.

const READING_AT = '2026-09-18T09:00:00.000Z'

export function methodRecordFixture(over: Partial<RecordInputs> = {}): RecordInputs {
  return {
    window: { kind: 'month', from: '2026-09-01', to: '2026-09-18' },
    delivery: { delivered: 3, dates: ['2026-09-01', '2026-09-06', '2026-09-13'], longestGapDays: 7, failed: 0, basis: 'run_clock' },
    coverage: [
      { audience: 'client', videos: 84, comments: 620, platformMix: { tiktok: 32, youtube: 24, instagram: 18, reddit: 10 }, dualMention: 6, excludedUndated: 3 },
      { audience: 'industry-other', videos: 1_388, comments: 11_220, platformMix: { tiktok: 528, youtube: 402, instagram: 292, reddit: 166 }, dualMention: 0, excludedUndated: 41 },
      { audience: 'competitor:Freitag', videos: 887, comments: 6_180, platformMix: { tiktok: 336, youtube: 258, instagram: 187, reddit: 106 }, dualMention: 0, excludedUndated: 22 },
    ],
    readDepth: { analysed: 2_359, speech: 1_675, translated: 519, onScreenText: 1_510, unflagged: 0, basis: 'all_time_non_reddit' },
    language: { analysed: 2_359, unknown: 604, english: 1_281, notEnglish: 474, basis: 'video_speech' },
    discard: { readable: false, judged: 0, kept: 0, setAside: 0, clearedByHeuristic: null, gateOff: null, failedOpen: null, recordedFrom: null, basis: 'run_clock' },
    instrument: { themesPerVideo: 2.4, themeAttachments: 5_662, analysedVideos: 2_359, runId: 'run-fixture' },
    changes: { inWindow: 1, loggedFrom: '2026-09-03', reconstructed: 9 },
    comparisonsRefused: 2,
    refusals: [],
    readingAt: READING_AT,
    frozenAt: null,
    ...over,
  }
}

/** The month that read — the shape the mock draws. */
export const methodFixture = (brand = 'Sealand'): MethodLines =>
  methodLines(methodRecordFixture(), { brand })

/** The degraded state: no month-by-month coverage, no language on record. The
 *  footnote keeps the three lines it can still stand behind. */
export const methodRefusedFixture = (brand = 'Sealand'): MethodLines =>
  methodLines(
    methodRecordFixture({
      coverage: null,
      language: { analysed: 2_359, unknown: 2_359, english: 0, notEnglish: 0, basis: 'video_speech' },
    }),
    { brand },
  )
