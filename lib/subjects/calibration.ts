import { createHash } from 'crypto'

import { SUBJECT_CALIBRATION_SAMPLE, SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW, SUBJECT_PRECISION_FLOOR } from './types'

// The precision gate (design :891): a subject's share is not shown to a client
// until precision has been measured, by hand, at or above 85%.
//
// WHY THIS IS A HARNESS AND NOT A METRIC. Nothing in this repo can tell whether
// an insight really is about "comfort" — that is the question the whole
// mechanism exists to answer, so there is no ground truth to compute against.
// A person has to read a sample and say. This file is the arithmetic on either
// side of that reading: which insights to put in front of them (deterministic,
// so two runs ask about the same ones), and what their answers mean at each
// threshold pair.
//
// The repo's precedent for choosing a threshold pair this way is
// REC_LINEAGE_THRESHOLD / REC_LINEAGE_CROSS_TYPE_THRESHOLD
// (lib/pipeline/rec-lineage.ts), which were picked against a labelled pair set
// rather than guessed. SUBJECT_MATCH_HIGH and SUBJECT_MATCH_LOW are guessed
// today, and this is how they stop being.

/**
 * A deterministic sample of keys.
 *
 * Deterministic because the labels are expensive: every one is read by a
 * person, and a sample that moved between the run that emitted the sheet and
 * the run that scores it would throw the work away. Hashed rather than strided
 * — a stride over an id order is a sample of whatever the id order happens to
 * correlate with, and `audience_insights.id` is minted per run, so a stride
 * would over-weight whichever run last re-read the corpus.
 */
export function sampleForCalibration(ids: readonly string[], n: number): string[] {
  return [...ids]
    .map((id) => ({ id, h: createHash('md5').update(id).digest('hex') }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))
    .slice(0, n)
    .map((x) => x.id)
}

/**
 * How many pairs to put in front of a person for ONE subject.
 *
 * THE UNIT IS THE PAIR, AND THE BUDGET IS PER TENANT. A decision is about a
 * (subject, insight) pair, so a sample of 200 insights crossed with every
 * active subject is 1,000-1,600 labels at 5-8 subjects — several days of
 * reading per tenant, not the afternoon the design budgets. The 200 is the
 * tenant's whole sheet instead, split evenly: 40 pairs each at five subjects,
 * 25 at eight. Thin, and honestly thin — `calibration_n` records exactly how
 * many labels a subject's figure rests on, and the precision table prints the
 * predicted count beside every row so a reader can see when a percentage is
 * four pairs out of five.
 */
export function calibrationQuota(subjects: number, total = SUBJECT_CALIBRATION_SAMPLE): number {
  if (subjects <= 0) return 0
  return Math.max(1, Math.floor(total / subjects))
}

/**
 * The pairs of one subject a person is asked about: a hashed sample of its
 * PREDICTED MEMBERS — the pairs the shipped procedure calls members at
 * (`high`, `low`): at or above `high` by vector, or inside the band with the
 * judge's yes on file.
 *
 * DRAWN FROM THE PREDICTED MEMBERS, NOT FROM THE SCORE RANGE (Heinrich's
 * ruling, 2026-09-24). The sheet used to be a hash over every pair at or above
 * the lowest threshold the table tries, and precision is correct / predicted —
 * so a subject whose judge rejects most of its band put two or three predicted
 * members in a 33-pair sheet and its "precision" was one pair out of two
 * (Sealand, Waterproofing 1/2 and Repair & warranty 1/3). Every label on this
 * sheet is now a label on something the product would count, which is what
 * `calibration_precision` claims to be: at the shipped pair, precision is
 * correct / sampled. What that costs is stated rather than hidden: the sheet
 * holds no pair the procedure says NO to, so it does not measure recall at
 * all, and a threshold row LOOSER than the shipped pair can only re-score the
 * members already drawn.
 *
 * A band pair with no judge decision on file is not a predicted member and is
 * not drawn — nobody has said yes to it. Run the membership pass first.
 *
 * Deterministic in the subject as well as the insight — the hash is over the
 * PAIR — so two subjects do not receive the same insights just because those
 * insights hash low, and re-emitting the sheet asks the same questions. Fewer
 * predicted members than `quota` means all of them. Ordered by score so the
 * reader walks from the obvious members down into the band.
 */
export function pickCalibrationPairs<T extends { audienceInsightId: string; score: number; judged: boolean | null }>(
  subjectId: string,
  scored: readonly T[],
  quota: number,
  high = SUBJECT_MATCH_HIGH,
  low = SUBJECT_MATCH_LOW,
): T[] {
  const eligible = scored.filter((r) => predictAt(r, high, low) === true)
  const keep = new Set(
    sampleForCalibration(eligible.map((r) => `${subjectId}|${r.audienceInsightId}`), quota),
  )
  return eligible
    .filter((r) => keep.has(`${subjectId}|${r.audienceInsightId}`))
    .sort((a, b) => b.score - a.score || (a.audienceInsightId < b.audienceInsightId ? -1 : 1))
}

/** One hand-labelled (subject, insight) pair, with what the machine knew. */
export interface LabelledPair {
  subjectId: string
  audienceInsightId: string
  /** Cosine similarity to the subject phrase. */
  score: number
  /** What the judge said about this pair, if it was ever asked. Null means it
   *  never was — either the pair never fell in a band, or no membership pass
   *  has run over it. */
  judged: boolean | null
  /** The person's answer. */
  label: boolean
}

/** What the shipped procedure would predict for a pair at a given threshold
 *  pair. `null` is not "no" — it is "this pair would go to the judge and nobody
 *  has asked it", which is a hole in the measurement and has to be counted as
 *  one rather than scored as a miss. */
export function predictAt(
  pair: Pick<LabelledPair, 'score' | 'judged'>,
  high: number,
  low: number,
): boolean | null {
  if (pair.score >= high) return true
  if (pair.score < low) return false
  return pair.judged
}

export interface PrecisionRow {
  high: number
  low: number
  /** Pairs the procedure would call members. */
  predicted: number
  /** Of those, the ones the person agreed with. */
  correct: number
  /** correct / predicted, or null when nothing was predicted. */
  precision: number | null
  /** Members the person named that the procedure would DECIDE AGAINST. A pair
   *  the procedure leaves to the judge is not missed — it is `unknown`. */
  missed: number
  /** Pairs that would land in the band with no judge decision on file — the
   *  measurement's own blind spot, printed rather than swept up. */
  unknown: number
}

/**
 * Precision at one threshold pair.
 *
 * PRECISION, not accuracy, and deliberately: the gate exists because a subject
 * that quietly swallows unrelated feedback makes every number about it a lie,
 * and that is a precision failure. Recall is reported alongside as `missed`,
 * because a subject can also be made to look precise by shrinking it to
 * nothing, and a reader has to be able to see that happening.
 */
export function precisionAt(
  pairs: readonly LabelledPair[],
  high = SUBJECT_MATCH_HIGH,
  low = SUBJECT_MATCH_LOW,
): PrecisionRow {
  let predicted = 0
  let correct = 0
  let missed = 0
  let unknown = 0
  for (const p of pairs) {
    const yes = predictAt(p, high, low)
    if (yes === null) {
      // UNKNOWN ONLY. A pair sitting in the band with no judge decision on file
      // has not been MISSED — nobody asked. Counting it in both columns made
      // the recall column read worse than the procedure is, and made `missed`
      // non-additive with `predicted`. `unknown` is the honest home for it, and
      // the printed table shows both columns so an operator can see it.
      unknown++
      continue
    }
    if (yes) {
      predicted++
      if (p.label) correct++
    } else if (p.label) {
      missed++
    }
  }
  return { high, low, predicted, correct, precision: predicted === 0 ? null : correct / predicted, missed, unknown }
}

/** The pairs worth trying. The shipped pair is always in the table, wherever it
 *  sits, so the reader can see what they have against what they could have.
 *
 *  The grid moved down with the thresholds (2026-09-23). The old one started at
 *  0.60/0.45 and ran to 0.80, which on real subject phrases is a sweep over
 *  empty space: the highest similarity any of Sealand's 3,719 live insights
 *  reaches against any of its six subjects is 0.733, and half the old grid's
 *  rows would have printed `predicted 0` forever. A sweep has to cover the
 *  region the data is actually in, or it cannot tell you that you are in the
 *  wrong one. */
export function candidateThresholds(
  highs: readonly number[] = [0.55, 0.6, 0.65, 0.7],
  lows: readonly number[] = [0.35, 0.4, 0.45, 0.5, 0.55],
): { high: number; low: number }[] {
  const out: { high: number; low: number }[] = []
  for (const high of highs) {
    for (const low of lows) {
      if (low >= high) continue
      out.push({ high, low })
    }
  }
  if (!out.some((p) => p.high === SUBJECT_MATCH_HIGH && p.low === SUBJECT_MATCH_LOW)) {
    out.push({ high: SUBJECT_MATCH_HIGH, low: SUBJECT_MATCH_LOW })
  }
  return out.sort((a, b) => a.high - b.high || a.low - b.low)
}

export function precisionTable(
  pairs: readonly LabelledPair[],
  thresholds = candidateThresholds(),
): PrecisionRow[] {
  return thresholds.map((t) => precisionAt(pairs, t.high, t.low))
}

/** Does this subject clear the gate on the sample it was labelled against? */
export function clearsPrecisionGate(row: PrecisionRow, floor = SUBJECT_PRECISION_FLOOR): boolean {
  return row.precision !== null && row.precision >= floor
}

/** One printed table. Monospace, because an operator reads it in a terminal and
 *  the whole point is comparing a column. */
export function formatPrecisionTable(rows: readonly PrecisionRow[]): string {
  const head = ' high    low  predicted  correct  precision  missed  unknown'
  const body = rows.map((r) => {
    const shipped = r.high === SUBJECT_MATCH_HIGH && r.low === SUBJECT_MATCH_LOW ? '  <- shipped' : ''
    // em-dash-ok: operator console table, the empty-cell mark
    const pct = r.precision === null ? '     —' : `${(100 * r.precision).toFixed(1)}%`.padStart(6)
    return (
      `${r.high.toFixed(2).padStart(5)}  ${r.low.toFixed(2).padStart(5)}  ` +
      `${String(r.predicted).padStart(9)}  ${String(r.correct).padStart(7)}  ${pct}  ` +
      `${String(r.missed).padStart(6)}  ${String(r.unknown).padStart(7)}${shipped}`
    )
  })
  return [head, ...body].join('\n')
}

/** One line of a labelled calibration sheet, as the scorer reads it. */
export interface SheetLine {
  subjectId: string
  audienceInsightId: string
  score: number
  /** true / false, or null for a pair nobody has labelled yet. */
  label: boolean | null
}

/**
 * Read a labelled sheet — and REFUSE it if any label is not a JSON boolean, or
 * any line has lost its ids or its score.
 *
 * THE SCORER COUNTED A STRING AS A YES (calibration skeptic, 2026-09-24).
 * `precisionAt` counts `if (p.label) correct++`, and the scorer skipped only
 * `label === null`, so a sheet whose labels were written "false", "not" or
 * "member" — the spot-check CSV's own words — scored every one of those pairs
 * as CORRECT, and a subject could go READY on answers that said no. Null is
 * still "not labelled yet" and is skipped with a warning; anything else that is
 * not `true` or `false` (a string, a number, a missing key, a line that is not
 * JSON) is refused by line number, and nothing is scored from the sheet.
 *
 * THE IDS AND THE SCORE ARE CHECKED TOO. A line with no subjectId became the
 * string "undefined" and was dropped silently as "(nothing labelled)"; a score
 * edited or lost became NaN, which predictAt reads as band → 'unknown' while
 * calibration_n still counted it. The skeptic named a dropped or rewritten
 * score as a real hazard; the labeller's diff against the .emitted copy was
 * the only guard. Each is refused by line number now.
 */
export function parseLabelledSheet(lines: readonly string[]): { rows: SheetLine[]; refused: string[] } {
  const rows: SheetLine[] = []
  const refused: string[] = []
  lines.forEach((text, i) => {
    if (!text.trim()) return
    let line: Record<string, unknown>
    try {
      line = JSON.parse(text) as Record<string, unknown>
    } catch {
      refused.push(`line ${i + 1}: not JSON`)
      return
    }
    if (!line || typeof line !== 'object') {
      refused.push(`line ${i + 1}: not a sheet line`)
      return
    }
    const label = line.label
    if (label !== null && typeof label !== 'boolean') {
      refused.push(`line ${i + 1}: label ${label === undefined ? 'missing' : JSON.stringify(label)} is not true, false or null`)
      return
    }
    for (const key of ['subjectId', 'audienceInsightId'] as const) {
      if (typeof line[key] !== 'string' || !(line[key] as string).trim()) {
        refused.push(`line ${i + 1}: ${key} ${line[key] === undefined ? 'missing' : JSON.stringify(line[key])} is not an id`)
        return
      }
    }
    if (typeof line.score !== 'number' || !Number.isFinite(line.score)) {
      refused.push(`line ${i + 1}: score ${line.score === undefined ? 'missing' : JSON.stringify(line.score)} is not a number`)
      return
    }
    rows.push({
      subjectId: line.subjectId as string,
      audienceInsightId: line.audienceInsightId as string,
      score: line.score,
      label,
    })
  })
  return { rows, refused }
}

/** What a recorded calibration writes on a subject, beside `calibrated_at`. */
export interface CalibrationFigures {
  calibration_precision: number | string | null
  calibration_n: number | null
  calibration_judge_version: string | null
}

const samePrecision = (a: number | string | null, b: number | string | null): boolean =>
  a === null || b === null ? a === b : Math.abs(Number(a) - Number(b)) < 1e-9

const sameFigures = (a: CalibrationFigures, b: CalibrationFigures): boolean =>
  samePrecision(a.calibration_precision, b.calibration_precision) &&
  (a.calibration_n ?? null) === (b.calibration_n ?? null) &&
  (a.calibration_judge_version ?? null) === (b.calibration_judge_version ?? null)

/**
 * Each subject's newest 'calibration' change-log `after`, by subject id, off
 * rows read newest first.
 */
export function lastCalibrationLogged(
  rows: readonly { after: unknown }[],
): Map<string, CalibrationFigures> {
  const out = new Map<string, CalibrationFigures>()
  for (const r of rows) {
    const after = r.after as (Partial<CalibrationFigures> & { id?: unknown }) | null
    if (!after || typeof after.id !== 'string' || out.has(after.id)) continue
    out.set(after.id, {
      calibration_precision: after.calibration_precision ?? null,
      calibration_n: after.calibration_n ?? null,
      calibration_judge_version: after.calibration_judge_version ?? null,
    })
  }
  return out
}

/**
 * Is this subject's calibration already RECORDED with exactly these figures —
 * on the subject AND on the change log?
 *
 * A RE-RUN OF --apply DUPLICATED TENANT-VISIBLE ROWS. The script stops at the
 * first subject whose change-log row fails and says re-run; the re-run then
 * re-wrote and re-logged every subject that had already succeeded, and
 * Sealand's change log showed two identical "Matching checked for…" lines for
 * each. So a subject is skipped only when BOTH agree with the new figure. The
 * subject alone is not enough: the one whose UPDATE landed and whose log row
 * failed has the new figure stored and no row, and it is exactly the one the
 * re-run exists to finish.
 */
export function calibrationRecorded(
  stored: CalibrationFigures,
  lastLogged: CalibrationFigures | null | undefined,
  next: CalibrationFigures,
): boolean {
  return lastLogged != null && sameFigures(stored, next) && sameFigures(lastLogged, next)
}

/**
 * The change-log note a recorded calibration leaves — TENANT-READABLE, on
 * Settings › The record (lib/settings/change-log.ts prints `note` verbatim).
 *
 * It used to read "precision measured by hand on 25 labelled pairs at 0.6/0.4":
 * "by hand" was false once the labels were a model's (the 24 Sep ruling), and
 * "0.6/0.4" is a raw threshold, which client copy never prints. Plain words,
 * and only what is true of every way the sheet can be labelled.
 *
 * NOT "COMMENTS". What is sampled is a (subject, audience insight) pair, and an
 * insight is one point drawn from ONE video's comments — several per video,
 * never one comment. "Comments" has a fixed meaning on every client surface
 * (lib/calibration.ts GLOSSARY: comments are counted separately, as comments),
 * so a note saying "25 sampled comments" is a copy claim the code does not
 * make. Once --apply writes it the row cannot be corrected without rewriting
 * history.
 */
export function calibrationNote(subject: string, pairs: number): string {
  return `Matching checked for ${subject} on ${pairs} sampled ${pairs === 1 ? 'viewer point' : 'viewer points'}.`
}
