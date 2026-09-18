import { SHARE_BAND, type BandOptions } from '../../report-bands'
import { fmtInt, fmtPct } from '../../format'
import { scrubProse } from '../../prose/scrub'
import { proseFigures } from '../../prose/figures'
import { REFUSAL_WHY, refusals as refusalsOf, refusedSentence, type Refusal } from '../../reading/record'
import { bandVerdict, type Counted, type FigureTable as ReadingFigures, type Verdict, type VerdictWindow } from '../../reading/verdicts'
import type { Quote } from '../../renderables/types'

/**
 * What the four briefs may PRINT, as figures (Block D wave 1, package D7).
 *
 * The pure half. Every function here takes counts and gives back a shape a
 * slide can bind; `load-reading.ts` is the I/O that gathers the counts, the
 * same split `reading.ts` / `load-reading.ts` already runs under — nothing in
 * this file touches a database, a clock or a model.
 *
 * THREE THINGS THE MOCK ASKS FOR AND THE PRODUCT DID NOT HOLD:
 *
 *  · `sales.p5.figure` — "12 videos, 7 toward you". The only switching data in
 *    the build is `lib/blocks/for-sales.ts`, which is week-scoped and
 *    UNDIRECTED: it is a list of comments that named a switch, with no side.
 *    `switchingFigure` is the counted, directed sibling.
 *  · `sales.p6.rows` — the "Say this" line. The one place the mock asks for
 *    prose the product does not write. `scriptedLines` keeps the mock's shape
 *    and puts every claim in it under a count.
 *  · `sales.p7.cannottell` — the refusals. These already exist, are already
 *    loaded by `load-reading.ts`, and were thrown away. `cannotTell` carries
 *    them to the slide in the record's own words.
 */

// ---- sales p5 · the switching figure ------------------------------------------

/**
 * Which way a video that names both leaned, from what is STORED.
 *
 * `videos.sentiment` and nothing else. The mock's "7 toward you" is a claim
 * about a direction, and the only alternative source for one is a model's
 * sentence about the video — which is the thing every rule in this product
 * exists to keep out of a figure.
 */
export type SwitchingLean = 'toward' | 'away' | 'neither'

/** One video in the pool: it named you and it named a tracked rival. */
export interface SwitchingVideo {
  id: string
  /** `videos.sentiment`, verbatim, or null where nothing judged it. */
  sentiment: string | null
}

export interface SwitchingInput {
  window: VerdictWindow
  /** The bucket the pool is counted under — `CLIENT_AUDIENCE` on today's
   *  rule, because the pool is the tenant's OWN videos that also name a
   *  rival. */
  audience: string
  /** That bucket in the reader's words. */
  audienceLabel: string
  videos: readonly SwitchingVideo[]
  /** How the pool was dated, in the reader's words. Required, because this is
   *  the one figure in the package that is NOT comment-dated and a reader who
   *  is not told will read it as though it were. */
  basis: string
  floor?: BandOptions
}

export interface SwitchingFigure {
  window: VerdictWindow
  audience: string
  audienceLabel: string
  /** Videos mentioning both you and a tracked rival — the pool, and the n. */
  pool: number
  toward: Counted
  away: Counted
  neither: Counted
  /** Only where the pool clears the floor. */
  verdict: Verdict | null
  /** "12 videos named both · 7 leaned toward you" — with the pool stated. */
  line: string
  unread: string | null
  /** What dates this figure. Printed beside it, never omitted. */
  basis: string
}

/** How `videos.sentiment` reads as a lean. Anything else — including null and
 *  the two writers' older vocabularies — is `neither`, which is the honest
 *  answer for "nothing stored says which way". */
export function leanOf(sentiment: string | null | undefined): SwitchingLean {
  const s = (sentiment ?? '').trim().toLowerCase()
  if (s === 'positive') return 'toward'
  if (s === 'negative') return 'away'
  return 'neither'
}

/**
 * The switching figure: of the videos that named both, how many leaned which
 * way — each over the pool, and the pool stated.
 *
 * THE VERDICT IS THE TOWARD SHARE AND NOTHING ELSE, and it is drawn only where
 * the pool clears `SHARE_BAND` on its own. There is no baseline here: a
 * `bandVerdict` with no baseline is the LEVEL, `too_little_data` with a null
 * change, which reads as "what it is running at" and never as "flat". A
 * quarter that wants a movement claim about switching needs two pools and a
 * second call, and this package does not build one.
 *
 * AND IT CARRIES `measurement_changed`. `videos.sentiment` is the column
 * `lib/reading/verdicts.ts` names as the ONE production instance of two
 * writers with two meanings (20260820110000_sentiment_split.sql; the
 * classify-meta reorder of 2026-08-16 read as "sentiment up 6.2 pts" in a
 * subject line that was sent). A figure built on it says so on its own face.
 *
 * Null when nothing at all is in the pool: "0 of 0 leaned toward you" is a
 * measurement of a thing nobody measured.
 */
export function switchingFigure(input: SwitchingInput): SwitchingFigure | null {
  const pool = input.videos.length
  if (pool === 0) return null
  const floor = input.floor ?? SHARE_BAND
  const count = (lean: SwitchingLean): number => input.videos.filter((v) => leanOf(v.sentiment) === lean).length
  const toward: Counted = { k: count('toward'), n: pool }
  const away: Counted = { k: count('away'), n: pool }
  const neither: Counted = { k: count('neither'), n: pool }

  // BELOW THE FLOOR IT REFUSES AND SAYS HOW MANY IT HAD. `bandVerdict` with no
  // baseline already answers `too_little_data`; the floor is checked here so a
  // pool of 54 does not get a verdict object that looks like an answer.
  // TWO FLOORS, AND A READER CAN DO THE SUBTRACTION. `SHARE_BAND` is
  // `{ minN: 100, minK: 10 }` and either arm can be the one that bites: a pool
  // of 124 with 4 toward clears n and fails k. Saying "too few to compare: 124
  // videos where a banded reading needs 100" about that pool is a sentence
  // that refutes itself on the page, so which floor bit is carried and said.
  const clearsN = pool >= floor.minN
  const clearsK = floor.minK == null || toward.k >= floor.minK
  const clears = clearsN && clearsK
  const verdict = clears
    ? bandVerdict({
        objectKind: 'audience',
        objectId: 'switching',
        objectLabel: 'videos naming you and a rival',
        audience: input.audience,
        window: input.window,
        value: toward,
        countedOver: { measure: 'videos', population: `videos that named both you and a tracked rival, ${input.basis}` },
        flags: ['measurement_changed'],
        floor,
      })
    : null

  const line = `${fmtInt(pool)} ${pool === 1 ? 'video' : 'videos'} named both you and a tracked rival · ${fmtInt(toward.k)} of ${fmtInt(pool)} leaned toward you${
    away.k > 0 ? `, ${fmtInt(away.k)} of ${fmtInt(pool)} away` : ''
  }.`

  // TWO DIFFERENT SILENCES. A pool under the floor is a reading we decline to
  // band; a pool whose videos carry no stored judgement is a reading we do not
  // have. Both are said, because a reader shown "3 of 54" and nothing else
  // cannot tell which of them they are looking at.
  const unreadParts: string[] = []
  if (!clearsN) {
    unreadParts.push(
      `Too few to compare: ${fmtInt(pool)} ${pool === 1 ? 'video' : 'videos'} where a banded reading needs ${fmtInt(floor.minN)}.`,
    )
  } else if (!clearsK) {
    unreadParts.push(
      `Too few to compare: ${fmtInt(toward.k)} of ${fmtInt(pool)} leaned toward you where a banded reading needs ${fmtInt(floor.minK ?? 0)}.`,
    )
  }
  if (neither.k > 0) {
    unreadParts.push(
      `${fmtInt(neither.k)} of ${fmtInt(pool)} carry nothing that says which way they leaned.`,
    )
  }

  return {
    window: input.window,
    audience: input.audience,
    audienceLabel: input.audienceLabel,
    pool,
    toward,
    away,
    neither,
    verdict,
    line,
    unread: unreadParts.length > 0 ? unreadParts.join(' ') : null,
    basis: input.basis,
  }
}

/**
 * `sales.p5.crosscheck` — the mock's reconciliation line, as a counted
 * sentence rather than prose.
 *
 * The mock reads "which squares with the objection share". It does not square
 * with anything unless the two figures are put beside each other WITH THEIR
 * OWN DENOMINATORS, and they are shares of two different populations: the
 * switching pool is the tenant's own videos that named a rival, and the
 * objection share is a kind's share of the category's month. So the line names
 * both populations and draws no arithmetic between them.
 */
export function crosscheckLine(
  figure: SwitchingFigure,
  objection: { label: string; value: Counted } | null,
): string | null {
  if (!objection || objection.value.n === 0) return null
  const towardPct = figure.pool > 0 ? (figure.toward.k / figure.pool) * 100 : 0
  const objectionPct = (objection.value.k / objection.value.n) * 100
  return (
    `${fmtInt(figure.toward.k)} of ${fmtInt(figure.pool)} (${fmtPct(towardPct)}) leaned toward you among the videos that named both; ` +
    `${objection.label.toLowerCase()} ran at ${fmtInt(objection.value.k)} of ${fmtInt(objection.value.n)} (${fmtPct(objectionPct)}) of the category's month. ` +
    'Two populations, two denominators — read them side by side, not against each other.'
  )
}

// ---- sales p6 · the scripted lines --------------------------------------------

/** What a scripted line is built from: an objection the conversation counted,
 *  the reasons under it, and the sentence a writer drafted for it. */
export interface ScriptedLineInput {
  objection: { label: string; registryId: string; value: Counted }
  /** Each reason with its own n — never a share of the objection's k. */
  because: { label: string; value: Counted }[]
  /** The drafted sentence, as the model wrote it. Absent where no draft
   *  exists, which is the state every workspace is in until a build runs. */
  draft?: string | null
  quote?: Quote | null
}

export interface ScriptedLinesInput {
  lines: readonly ScriptedLineInput[]
  /** The figures the drafted sentences may name, by token. A digit outside
   *  this table costs its sentence. */
  figures: ReadingFigures
  /** Drop a line whose objection is under this many videos. */
  minK?: number
}

export interface ScriptedLine {
  /** The objection, as a counted theme. */
  objection: { label: string; registryId: string; value: Counted }
  /** The scripted sentence, already scrubbed under `document_write`. */
  say: string
  /** Each reason with its own n. */
  because: { label: string; value: Counted }[]
  quote: Quote | null
}

/** Below this the objection is one person's, and a rep told to answer it would
 *  be answering nobody. */
export const SCRIPTED_MIN_K = 3

/**
 * The mock's "Say this" rows, with every claim in them counted.
 *
 * WHAT IS THE PRODUCT'S AND WHAT IS THE MODEL'S. The objection, its k and n,
 * and every "Because" figure are the reading's — counted, banded elsewhere,
 * printed with their denominators. The SENTENCE is the model's, and it goes
 * through `scrubProse('document_write', …)` with the caller's figure table, so
 * a digit the model typed that is not a `[[key]]` the table holds takes its
 * whole sentence with it. A line whose draft does not survive keeps its
 * counts and prints no script: the reading is the value, and the tip is not.
 *
 * NO SENTENCE IS INVENTED HERE. With no draft there is no script, and the row
 * is the objection and its reasons. That is the difference between a brief
 * that is short and a brief that is made up.
 */
export function scriptedLines(input: ScriptedLinesInput): ScriptedLine[] {
  const minK = input.minK ?? SCRIPTED_MIN_K
  const figures = proseFigures(input.figures)
  const out: ScriptedLine[] = []
  for (const line of input.lines) {
    if (line.objection.value.k < minK || line.objection.value.n <= 0) continue
    const scrubbed = line.draft ? scrubProse('document_write', line.draft, { figures }) : null
    out.push({
      objection: line.objection,
      say: scrubbed?.text ?? '',
      // A REASON WITH NO DENOMINATOR IS NOT A REASON. The mock prints three
      // bare phrases under each objection; each one here carries the n it is a
      // share of, and a reason nobody counted does not appear.
      because: line.because.filter((b) => b.value.n > 0),
      quote: line.quote ?? null,
    })
  }
  return out
}

// ---- sales p2 / qr p3 · the two-series month line ------------------------------

/** One side of the line: a name, the points, and the months they sit on. */
export interface MonthLineSeries {
  label: string
  /** One value per month on `months`, null where the month could not be read. */
  points: (number | null)[]
  /** How many readings the side actually carries — what `DIRECTION_RUN` is
   *  counted against, and what decides whether it is drawn at all. */
  readings: number
}

export interface MonthLine {
  /** The axis, oldest first. Every month, including the ones nobody read. */
  months: readonly string[]
  /** Only the sides that have the n. A side with fewer than two readings is
   *  not a line, and drawing it as one is the claim D3 refuses. */
  series: MonthLineSeries[]
  /** `monthlyLineLabel`'s answer for the drawn side — "Aug → Sep only", "Sep
   *  only", "no month reads" — or null once three readings stand behind it. */
  label: string | null
  /** Said instead of the chart when no side could be drawn. */
  empty: string | null
}

/** A side has to carry this many readings before it is drawn as a line. Two
 *  points are a line on the page and one comparison in the data, which is the
 *  gap D3 is about; three is what `directionWord` needs, and a chart is a
 *  direction claim too (AGENTS.md, verbatim). */
export const LINE_MIN_READINGS = 3

/**
 * The mock's monthly chart, drawn only for the side that has the n.
 *
 * NO DIRECTION WORD ANYWHERE IN THIS SHAPE, and that is the point: the mock
 * labels its chart "narrowed" and "up, 2nd month". Neither is earned by two
 * readings of one series, and only `directionWord` may fill one at all — from
 * three consecutive readings inside one clustering regime, and only where the
 * reader's own flag is true, which for every reader on this artefact it is
 * not. What the chart carries instead is the AXIS: which months it could read,
 * named by `monthlyLineLabel` when there are too few to draw.
 */
export function monthLine(input: {
  months: readonly string[]
  series: readonly { label: string; points: (number | null)[] }[]
  /** `monthlyLineLabel` from lib/pages/overview.ts, passed in so this stays
   *  pure of the page loader it would otherwise import. */
  labelFor: (points: readonly (number | null)[], months: readonly string[]) => string | null
  minReadings?: number
}): MonthLine {
  const min = input.minReadings ?? LINE_MIN_READINGS
  const sides = input.series.map((s) => ({
    label: s.label,
    points: [...s.points],
    readings: s.points.filter((p) => p != null).length,
  }))
  const drawn = sides.filter((s) => s.readings >= min)
  // THE LABEL IS THE THICKEST SIDE'S, because it describes the axis the chart
  // could be read on and the thickest side is the one that decides it.
  const thickest = [...sides].sort((a, b) => b.readings - a.readings)[0] ?? null
  return {
    months: input.months,
    series: drawn,
    label: drawn.length > 0 ? null : thickest ? input.labelFor(thickest.points, input.months) : null,
    empty:
      drawn.length > 0
        ? null
        : sides.length === 0
          ? 'Nothing on this page has a month series behind it yet.'
          : `No side of this comparison carries ${min} monthly readings yet, so the months are named instead of drawn.`,
  }
}

// ---- sales p7 · what we cannot tell you ---------------------------------------

export interface CannotTell {
  refusals: Refusal[]
  /** `refusedSentence(refusals)` — the same words the record prints. */
  line: string
  /** One line per refusal, with REFUSAL_WHY's own wording. */
  items: string[]
}

/** The other two ways a comparison goes undrawn, in the same voice as
 *  `REFUSAL_WHY`. Kept beside it rather than imported: `record.ts` holds its
 *  copy private because the record's own sentence pools them, and a per-item
 *  list has to name each one. */
const NOT_DRAWN_ITEM: Record<string, string> = {
  too_little_data: 'too little was read on one side or both',
  baseline_forming: 'there are not enough months behind it yet',
}

/**
 * The refusals, carried to the slide.
 *
 * THE CHEAPEST ITEM IN THE PACKAGE AND THE ONE THAT MATTERS MOST. This is the
 * product's own honesty machinery, already computed on every brief's reading
 * and thrown away at the door. Printing it is the whole of `sales.p7`.
 *
 * Every string here is the RECORD's, not a second wording of it: the summary
 * is `refusedSentence`, and each item is `REFUSAL_WHY`'s own clause. A brief
 * and the record page cannot come to say different things about one refusal.
 */
export function cannotTell(verdicts: readonly Verdict[]): CannotTell {
  const list = refusalsOf(verdicts)
  const items = list.map((r) => {
    const why = r.state === 'refused' && r.reason
      ? REFUSAL_WHY[r.reason]
      : NOT_DRAWN_ITEM[r.state] ?? REFUSAL_WHY.unlogged_era
    return capitalise(`${why}.`)
  })
  return { refusals: list, line: refusedSentence(list), items }
}

const capitalise = (s: string): string => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1))
