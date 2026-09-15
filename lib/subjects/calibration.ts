import { createHash } from 'crypto'

import { SUBJECT_MATCH_HIGH, SUBJECT_MATCH_LOW, SUBJECT_PRECISION_FLOOR } from './types'

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
 * A deterministic sample of insight ids.
 *
 * Deterministic because the labels are expensive: 200 of them per tenant, read
 * by a person, and a sample that moved between the run that emitted the sheet
 * and the run that scores it would throw the work away. Hashed rather than
 * strided — a stride over an id order is a sample of whatever the id order
 * happens to correlate with, and `audience_insights.id` is minted per run, so a
 * stride would over-weight whichever run last re-read the corpus.
 */
export function sampleForCalibration(ids: readonly string[], n: number): string[] {
  return [...ids]
    .map((id) => ({ id, h: createHash('md5').update(id).digest('hex') }))
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))
    .slice(0, n)
    .map((x) => x.id)
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
  /** Members the person named that the procedure would miss. */
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
      unknown++
      if (p.label) missed++
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
 *  sits, so the reader can see what they have against what they could have. */
export function candidateThresholds(
  highs: readonly number[] = [0.6, 0.65, 0.7, 0.75, 0.8],
  lows: readonly number[] = [0.45, 0.5, 0.55, 0.6],
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
    const pct = r.precision === null ? '     —' : `${(100 * r.precision).toFixed(1)}%`.padStart(6)
    return (
      `${r.high.toFixed(2).padStart(5)}  ${r.low.toFixed(2).padStart(5)}  ` +
      `${String(r.predicted).padStart(9)}  ${String(r.correct).padStart(7)}  ${pct}  ` +
      `${String(r.missed).padStart(6)}  ${String(r.unknown).padStart(7)}${shipped}`
    )
  })
  return [head, ...body].join('\n')
}
