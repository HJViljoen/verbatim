import { JUDGE_VERSION, SUBJECT_PRECISION_FLOOR, wilsonUpper, type Subject } from './types'

// A subject's calibration, in three states (market-first decision C, WP1.1).
//
// WHAT THE THREE STATES ARE FOR. A subject is a set of insights a judge filed
// under a name, and the precision check (scripts/subject-calibration.ts) says
// how often the judge was right on a hand-labelled sample. Until 25 Sep the
// product had two answers, `calibrating` and `ready`, and `calibrating` hid a
// subject's share on the Subjects rail and nowhere else. Decision C asks for
// three:
//
//   ready        the check measured SUBJECT_PRECISION_FLOOR (0.85) or better,
//                under the judge the subject's numbers were read with. It
//                prints normally.
//   provisional  not checked yet, checked under another judge, or under 0.85
//                with a likely range that still reaches 0.85. Its MARKET level
//                prints, marked "provisional"; its client level does not. It
//                earns no change verdict and no direction word, it is never a
//                headline, and it has no "you" side.
//   failed       checked under this judge, and clearly under: even the top of
//                its likely range (`wilsonUpper`) is below 0.85. It is hidden
//                everywhere as "being re-described".
//
// "CLEARLY UNDER" IS THE UPPER END OF A 95% WILSON INTERVAL, never the point
// estimate. On 25 labels, 0.80 reaches about 0.91, so a subject at 0.80 may
// yet clear the floor and stays provisional; 0.60 reaches about 0.77, and
// Repair & warranty's 0.333 on 33 reaches about 0.50, so both are failed.
//
// WHY THIS FILE AND NOT lib/subjects/types.ts. The plan pins these names in
// types.ts (§4.2), but types.ts is imported by lib/subjects/read.ts, which is
// on the freeze-months path (tsconfig.freeze-months.json), and nothing on that
// path may change before the 4 Oct run (plan §7.11). The two-state
// `SubjectCalibration` / `subjectCalibration` in types.ts are left exactly as
// they are and no surface reads them any more; they go when that path opens.
//
// A STORED ARTEFACT IS READ, NEVER REWRITTEN. A snapshot sent before this
// change carries `'calibrating'` on the Subjects rail and pane, or no field
// at all on every other subject row. `readCalibration` reads the first as
// provisional; a row with no field renders exactly as it was sent, with no
// word (the predicates below treat `null` as "no gate was applied").

export type SubjectCalibration = 'ready' | 'provisional' | 'failed'

/** What a Subjects rail or pane row may carry once stored: the three states,
 *  or the two-state word a snapshot sent before WP1.1 holds. */
export type StoredCalibration = SubjectCalibration | 'calibrating'

/** The words a subject row carries for the two states that carry one. A ready
 *  subject carries none: it prints normally. */
export const CALIBRATION_WORDS: Record<'provisional' | 'failed', string> = {
  provisional: 'provisional',
  failed: 'being re-described',
}

/**
 * A stored or live value, read as a state.
 *
 * `'calibrating'` is the two-state vocabulary's word for "not ready" and reads
 * as provisional: those snapshots were sent before the check could tell a
 * subject that had not been checked from one that failed, and provisional is
 * the state that claims neither. Anything else, including a missing field, is
 * null: the row renders as it was sent.
 */
export function readCalibration(v: string | null | undefined): SubjectCalibration | null {
  if (v === 'ready' || v === 'provisional' || v === 'failed') return v
  if (v === 'calibrating') return 'provisional'
  return null
}

/** A stored numeric column: PostgREST can hand a `numeric` back as a string. */
function asNumber(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Which of the three states a subject's stored calibration earns.
 *
 * THE JUDGE VERSION IS REQUIRED for both ready and failed. A precision
 * measured under another judge (a moved threshold, a changed prompt) is not
 * evidence about the numbers the subject carries now, either way: it cannot
 * make a subject ready, and it cannot make one failed. A figure with no judge
 * version at all is the legacy case, a figure from a band nobody can name, and
 * reads provisional (the two-state gate failed closed on it too).
 *
 * NO LABEL COUNT, NO FAILURE. Under the floor with `calibration_n` missing or
 * zero, the range cannot be drawn, and a subject is never hidden on a sample
 * that does not exist (`wilsonUpper` answers 1 at n ≤ 0).
 */
export function subjectCalibration(
  s: Pick<Subject, 'calibrated_at' | 'calibration_judge_version'> & {
    calibration_precision: number | string | null
    calibration_n?: number | string | null
  },
  judgeVersion: string = JUDGE_VERSION,
): SubjectCalibration {
  if (!s.calibrated_at) return 'provisional'
  if (s.calibration_judge_version !== judgeVersion) return 'provisional'
  const precision = asNumber(s.calibration_precision)
  if (precision == null) return 'provisional'
  if (precision >= SUBJECT_PRECISION_FLOOR) return 'ready'
  const n = asNumber(s.calibration_n)
  if (n == null || n <= 0) return 'provisional'
  // NaN (an impossible precision) fails this comparison and reads provisional.
  return wilsonUpper(precision, n) < SUBJECT_PRECISION_FLOOR ? 'failed' : 'provisional'
}

/** The word a row carries, or null: ready rows and rows stored without the
 *  field carry none. Accepts a stored string ('calibrating'). */
export function calibrationWord(v: string | null | undefined): string | null {
  const state = readCalibration(v)
  return state === 'provisional' || state === 'failed' ? CALIBRATION_WORDS[state] : null
}

/** Does the subject's MARKET level print? Everything but failed. */
export function printsMarket(v: string | null | undefined): boolean {
  return readCalibration(v) !== 'failed'
}

/** Does the subject's CLIENT level (the "you" side, your own posts) print?
 *  Only when ready, or on a stored row that carries no field (as sent). */
export function printsClient(v: string | null | undefined): boolean {
  const state = readCalibration(v)
  return state == null || state === 'ready'
}

/** May the subject carry a change verdict, a direction word or a headline?
 *  Only when ready, or on a stored row that carries no field (as sent). */
export function earnsVerdict(v: string | null | undefined): boolean {
  const state = readCalibration(v)
  return state == null || state === 'ready'
}

/** Is the subject hidden as "being re-described"? */
export function isFailed(v: string | null | undefined): boolean {
  return readCalibration(v) === 'failed'
}
