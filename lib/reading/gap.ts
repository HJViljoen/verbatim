import { longMonth, fmtInt, fmtPct, round1 } from '../format'
import { sameRegime } from '../pipeline/clustering'
import { proportionDelta, SHARE_BAND, type BandOptions } from '../report-bands'
import { DIRECTION_RUN, type Direction } from './bands'
import { monthStartOf, nextMonth } from './monthly'
import type { Counted, FigureTable, ObjectKind, RefusedReason, VerdictFlag, VerdictWindow } from './verdicts'

// The two-audience gap, as a banded difference (Phase 1 Block D, D1).
//
// WHAT WAS MISSING. The mock's most prominent sentence is "Durability gap to
// Freitag narrowed to 13 points … narrowed from 19 in June", and nothing in
// the product could produce either half of it. `lib/reading/verdicts.ts`
// compares ONE object's two readings — this month against last — and has no
// shape at all for the difference between two audiences read in the SAME
// month. So six elements across five artboards had no field behind them, and
// the headline of the monthly report had no number.
//
// WHY IT IS NOT A VERDICT. A `Verdict` is a claim that something MOVED. A gap
// is a claim that two things DIFFER, and the two are not the same statement
// even though the arithmetic underneath them is: 31% of your 84 videos against
// 44% of Freitag's 142 is a difference of two independent proportions on two
// different denominators, taken at one instant. Nothing about it is a
// direction, so it can never earn a direction word from one reading, and
// folding it into `Verdict` would have let every reader of that type treat it
// as one. It gets its own shape, its own four-word vocabulary and its own
// function, and `lib/reading/verdicts.ts` is untouched.
//
// WHAT IT DOES SHARE. The band. `proportionDelta` (lib/report-bands.ts) is
// already an UNPOOLED two-proportion difference with a 2×SE band floored at 2
// points — it was written for "this month against last month", but the
// statistic does not care which two proportions it is handed, and the product
// has exactly one band rule on purpose. So the gap is banded by the same
// function, with the same `SHARE_BAND` floors (100 videos a side, 10 of the
// object's own), and a difference between what the gap says and what the two
// levels beside it say is impossible by construction.
//
// AND WHAT THAT FLOOR MEANS ON TODAY'S CORPUS, stated here because it is the
// answer the product will actually give: Sealand's own audience carries 84
// videos in September, under the 100-video floor, so the you-vs-rival gap the
// mock prints as "13 points" reads `too few to compare` on a month and clears
// only over a quarter. That is the same refusal the mock's own change column
// prints one cell away — the product is consistent, and the headline is not
// sayable at a month's n.
//
// THE MOCK'S "NARROWED" IS NOT BUILT AS A WORD. It is built as a SECOND DATED
// GAP READING (`Gap.basis`) printed beside the first with its own band — "12.7
// points apart this month, band 13.1 · 19 points in June, band 8.1" — so a
// reader can see the movement without the product claiming it. `Gap.direction`
// exists for the day a reader re-bases, and only `gapDirection` may fill it:
// three consecutive monthly gap readings in ONE clustering regime AND a
// `directionWordsFor(reader)` flag that is true. No wave-1 package turns a
// flag on, so it is null on every surface today.

/**
 * What a gap concluded. Four words, and they are deliberately NOT `Verdict`'s
 * five: `moved` and `no_clear_change` are about time and would be a lie here.
 *
 * `apart`            the difference clears its band — the two audiences differ
 * `level`            the difference is inside the band — they read the same
 * `too_little_data`  a side is under the floor, or was never read at all
 * `refused`          the comparison could be drawn and must not be (a rename,
 *                    a tracking change, a re-grouping, an unlogged era)
 */
export type GapState = 'apart' | 'level' | 'too_little_data' | 'refused'

/**
 * The reader's word for each state.
 *
 * `too few to compare` and `comparison refused` are the badge's own phrases
 * (`MOVEMENT_WORDS`, components/delta-badge.tsx — P0 lands the first of them
 * in the same wave, replacing "too little data", which is the phrase
 * `GLOSSARY.change` has always used in its rule text). They are repeated here
 * rather than imported because `lib/reading` may not depend on `components`,
 * and a reading module that imported a badge to get a string would be the
 * wrong dependency for the sake of five words.
 *
 * AND `level` IS A TOKEN, NOT THE WORD PRINTED. "Level" is already one of the
 * THIRTEEN_WORDS (`GLOSSARY.level`, lib/calibration.ts) and it means something
 * else there — "what a figure is running at, always printed with its
 * denominator". `gapLine` prints both senses in one sentence, so a gap that
 * printed the bare word would read "you 31% of 252 · Freitag 44% of 426 ·
 * level", where the first two clauses ARE levels and the third is denying a
 * difference between them. The reader's phrase is "no clear difference",
 * which is exactly the construction `GLOSSARY.change` already uses for the
 * same conclusion about one object over time ("no clear change") — one
 * vocabulary, two objects. The state token stays `level` because that is what
 * the band concluded and what every caller switches on.
 */
export const GAP_WORDS: Record<GapState, string> = {
  apart: 'apart',
  level: 'no clear difference',
  too_little_data: 'too few to compare',
  refused: 'comparison refused',
}

export interface GapSide {
  /** The literal bucket string: 'client', 'competitor:<name>', 'industry-other'. */
  audience: string
  /** What a reader is shown — 'you', 'Freitag', 'the category'. */
  label: string
  value: Counted
  /**
   * The share this side PRINTS, as the surface prints it (`pctOf(k, n)`), or
   * null to derive it from `value`.
   *
   * THE ARITHMETIC USES THIS NUMBER, not a second one computed here. A gap
   * whose difference is taken from a fresh k/n while the levels beside it
   * print a rounded one reads "31% · 44% · 12.7 points apart", and a reader
   * who subtracts gets 13. The product's rule is that a gap can never disagree
   * with the two levels printed beside it, so the gap is the difference of
   * exactly the two numbers the page shows.
   */
  pct: number | null
  /** False where this audience carried no row at all — "— not tracked". */
  observed: boolean
}

export interface GapReading {
  window: VerdictWindow
  /** a.pct − b.pct, one decimal. Signed, so the caller keeps which side is
   *  higher; the SENTENCE prints the magnitude, because "apart" is symmetric
   *  and the two levels beside it already say which way round it is.
   *
   *  NULL WHEREVER THE STATE IS NOT AN ANSWER — a side unread, a side under the
   *  floor, or a refusal. The two words that refuse a comparison never carry
   *  the number that comparison would have been, in the data or on the page. */
  gapPts: number | null
  /** Half-width of the no-difference band, same units. Null wherever no band
   *  was drawn — which is everywhere `gapPts` is null, and for the same
   *  reason. */
  bandPts: number | null
  state: GapState
  /**
   * The clustering that produced this reading, where the object is one a
   * re-grouping can move (a theme). Null is UNKNOWN and is never equal to
   * another null (`sameRegime`), so a stretch of months frozen before the
   * fingerprint shipped earns no direction word.
   *
   * NOT IN THE PINNED INTERFACE, and added deliberately: `gapDirection`'s
   * contract is "three consecutive readings in ONE clustering regime", and a
   * `GapReading` carrying no regime at all gives it nothing to check that
   * against. Optional, so every pinned call site is unchanged and an omitted
   * regime refuses the word — conservative in the direction a reader survives.
   * A subject's membership is not a clustering artefact; such a series passes
   * `'n/a'`, exactly as `SeriesPoint.regime` does.
   */
  regime?: string | null
  /**
   * The two audiences this reading compares, as `a.audience|b.audience` —
   * filled by `gapBetween` from the sides it was handed.
   *
   * NOT IN THE PINNED INTERFACE either, and for the gate `directionWord`
   * already applies and this module could not: `directionWord` refuses a run
   * whose readings change audience (lib/reading/bands.ts), because a word
   * spoken across that change is a claim about which rival we happened to
   * read rather than about the conversation. A `GapReading` carries no
   * audience at all — it is a difference of two — so a series that swapped
   * Freitag for Cotopaxi halfway earned a direction word from two different
   * comparisons. Optional, and an absent pair refuses the word, the same way
   * an absent regime does: two unknowns are not one pair.
   */
  pair?: string | null
}

export interface Gap extends GapReading {
  objectKind: ObjectKind
  /** Stable identity — theme_registry.id, a subject id. Never a label. */
  objectId: string
  objectLabel: string
  /** The side the sentence is about (yours, by convention). */
  a: GapSide
  /** The side it is measured against. */
  b: GapSide
  /** The same gap at an earlier window — the mock's "from 19 in June". */
  basis: GapReading | null
  /** Earned by `gapDirection` alone, over three consecutive readings in one
   *  regime AND a reader flag that is true. Null everywhere in wave 1. */
  direction: Direction | null
  flags: VerdictFlag[]
  refusedReason?: RefusedReason
}

export interface GapInput {
  objectKind: ObjectKind
  objectId: string
  objectLabel: string
  a: GapSide
  b: GapSide
  window: VerdictWindow
  basis?: { a: GapSide; b: GapSide; window: VerdictWindow }
  flags?: VerdictFlag[]
  /** Draw no comparison and say why (rename, tracking change, re-grouping). */
  refused?: RefusedReason
  /** Defaults to SHARE_BAND — 100 videos a side, 10 of the object's own,
   *  never narrower than 2 points. */
  floor?: BandOptions
  /** Forwarded to the readings — see `GapReading.regime`. */
  regime?: string | null
  basisRegime?: string | null
}

/** The share a side is read at: what it PRINTS, or its own counts where it
 *  prints nothing. Null where there is no denominator to divide by. */
export function sidePct(side: GapSide): number | null {
  if (side.pct != null) return side.pct
  return side.value.n > 0 ? round1((side.value.k / side.value.n) * 100) : null
}

/** Is this side readable at all — was the audience read, and does it carry a
 *  denominator? Below the FLOOR is a different answer and the band gives it. */
const readable = (side: GapSide): boolean => side.observed && sidePct(side) != null

function readingBetween(
  a: GapSide,
  b: GapSide,
  window: VerdictWindow,
  floor: BandOptions,
  refused: RefusedReason | undefined,
  regime: string | null | undefined,
): GapReading {
  const base = { window, pair: `${a.audience}|${b.audience}`, ...(regime !== undefined ? { regime } : {}) }
  // A REFUSAL IS NOT A THIN READING. The counts are real on both sides and the
  // levels still print; it is the DIFFERENCE that must not be stated, so it
  // carries neither a magnitude nor a band — the same shape `bandVerdict`
  // gives a refused verdict.
  if (refused) return { ...base, gapPts: null, bandPts: null, state: 'refused' }
  if (!readable(a) || !readable(b)) return { ...base, gapPts: null, bandPts: null, state: 'too_little_data' }

  const delta = proportionDelta(
    {
      nowPct: sidePct(a) as number,
      prevPct: sidePct(b) as number,
      nowN: a.value.n,
      prevN: b.value.n,
      nowK: a.value.k,
      prevK: b.value.k,
    },
    floor,
  )
  if (delta.state === 'too_little_data') {
    // A THIN COMPARISON CARRIES NO NUMBERS AT ALL, not even on the data.
    // `proportionDelta` still returns a change and a band here — it is
    // answering "what would this have been" — but a `too few to compare` gap
    // that carries 12.7 in `gapPts` is a magnitude beside a word that refuses
    // the comparison, and the only thing standing between it and the page is
    // whether every future caller remembers to check `state` first.
    // `gapLine` and `gapFigures` check; block DATA is what wave 2 binds, and a
    // port writing `{gap.gapPts} points` would print the number the word
    // refused. So the refusal is in the DATA, and the field's docblock is true
    // of the field: numbers only where the comparison was drawn.
    return { ...base, gapPts: null, bandPts: null, state: 'too_little_data' }
  }
  const state: GapState = delta.state === 'moved' ? 'apart' : 'level'
  return { ...base, gapPts: delta.change, bandPts: delta.band, state }
}

/**
 * The ONE place a gap is built. Never re-derive a difference in a loader.
 *
 * Both sides come off the same month rows the levels already come from, so the
 * gap, the two levels and the band are three readings of one pair of numbers
 * rather than three measurements of one quantity — which is the bug this
 * product has shipped once already and the reason `lib/reading` holds the only
 * copy of every rule.
 *
 * A refusal travels to the BASIS too: a rename or a tracking change on either
 * side breaks both readings, and printing "19 points in June" beside a refused
 * September would be the refusal made decorative.
 */
export function gapBetween(input: GapInput): Gap {
  const floor = input.floor ?? SHARE_BAND
  const here = readingBetween(input.a, input.b, input.window, floor, input.refused, input.regime)
  const basis = input.basis
    ? readingBetween(
        input.basis.a,
        input.basis.b,
        input.basis.window,
        floor,
        input.refused,
        input.basisRegime !== undefined ? input.basisRegime : input.regime,
      )
    : null

  return {
    ...here,
    objectKind: input.objectKind,
    objectId: input.objectId,
    objectLabel: input.objectLabel,
    a: input.a,
    b: input.b,
    basis,
    // ONLY `gapDirection` FILLS THIS, and it needs three readings and a reader
    // flag. A gap built from one window has nothing to say about direction.
    direction: null,
    flags: input.flags ?? [],
    ...(input.refused ? { refusedReason: input.refused } : {}),
  }
}

export interface InheritedRefusal {
  /** A reading on one side refused, so the difference must not be stated. */
  refused: boolean
  /** Why, where a refusing reading recorded it. NULL means a side refused and
   *  none of them said why — a caller that gets this draws no gap at all
   *  rather than a difference beside a refused column. */
  reason: RefusedReason | null
}

/**
 * The refusal a gap inherits from the readings it is drawn between.
 *
 * IT ASKS EVERY SIDE, WHICH IS THE WHOLE POINT. The first cut wrote this as a
 * chain — "is `you` refused? then its reason : is the category refused? then
 * its reason" — and a refused `you` with no reason recorded yielded
 * `undefined` and never reached the second question, so the gap was drawn
 * beside a column the page had already refused to read. A check that can be
 * satisfied by the failure it is checking for is worse than no check: it reads
 * as if it were doing something.
 *
 * If the product will not say whether one side moved, it will not say how far
 * apart the two are either — both refusals are about the same break in the
 * record.
 */
export function inheritRefusal(
  sides: readonly { state: string; refusedReason?: RefusedReason }[],
): InheritedRefusal {
  const refusing = sides.filter((s) => s.state === 'refused')
  if (refusing.length === 0) return { refused: false, reason: null }
  return { refused: true, reason: refusing.map((s) => s.refusedReason).find((r) => r != null) ?? null }
}

/** A side as a level: the share and the denominator it is a share of, or the
 *  silence in the page's own words. Every level prints its "of N". */
function levelOf(side: GapSide): string {
  if (!side.observed) return `${side.label} — not tracked`
  const p = sidePct(side)
  if (p == null) return `${side.label} — no reading`
  return `${side.label} ${fmtPct(p)} of ${fmtInt(side.value.n)}`
}

/** A magnitude in points, trailing `.0` dropped: 19 → "19", 12.7 → "12.7". */
const pts = (n: number): string => `${round1(n)}`

export interface GapLineOptions {
  /**
   * Name the window the gap was read over, before the two levels.
   *
   * A GAPLINE PRINTED BESIDE FIGURES OF A DIFFERENT PERIOD MUST SAY SO. The
   * quarterly subjects row prints the MONTH's levels in its body ("you 31% of
   * 84 · the category 22% of 1,388") and binds this line for the QUARTER's, so
   * unlabelled it puts two different "you …% of N" in one row and a reader has
   * no way to tell which is which. The Overview and the Subjects pane print a
   * gap of the same month as the figures around it and pass nothing.
   */
  period?: boolean
}

/**
 * The reader's sentence: both levels, the difference, the band, the state —
 * "you 31% of 84 · Freitag 43.7% of 142 · 12.7 points apart (band 13.1)", and
 * with `period` the window in front of it: "The quarter from July 2026 · you
 * 30.1% of 249 · The category 22% of 4,147 · 8.1 points apart (band 6)".
 *
 * THE MAGNITUDE PRINTS ONLY WHERE THE GAP IS `apart`. This is D2's rule, the
 * mock's single most load-bearing error and the one `MovementBadge` has always
 * kept: a signed figure beside a word that says the comparison was not earned
 * makes the claim the word refused, because the number is what a reader takes
 * away. `level` prints its band — the band is the evidence for "they read the
 * same" — and the two refusals print neither.
 */
export function gapLine(gap: Gap, options: GapLineOptions = {}): string {
  const sides = `${levelOf(gap.a)} · ${levelOf(gap.b)}`
  const body =
    gap.state === 'apart' && gap.gapPts != null && gap.bandPts != null
      ? `${sides} · ${pts(Math.abs(gap.gapPts))} points ${GAP_WORDS.apart} (band ${pts(gap.bandPts)})`
      : gap.state === 'level' && gap.bandPts != null
        ? `${sides} · ${GAP_WORDS.level} (band ${pts(gap.bandPts)})`
        : `${sides} · ${GAP_WORDS[gap.state]}`
  if (!options.period) return body
  const when = periodLabel(gap.window)
  return `${when.charAt(0).toUpperCase()}${when.slice(1)} · ${body}`
}

/**
 * The earlier reading beside it, or null — "19 points apart in June (band
 * 8.1)".
 *
 * This is what the mock writes as "narrowed from 19 in June", and the
 * difference between the two sentences is the whole of decision D1: a second
 * dated reading with its own band lets a reader see that the gap was larger
 * and decide for themselves; the word "narrowed" is the product deciding for
 * them, off two readings, which is a direction claim it has not earned.
 */
export function gapBasisLine(gap: Gap): string | null {
  const basis = gap.basis
  if (!basis) return null
  const when = periodLabel(basis.window, gap.window)
  if (basis.state === 'apart' && basis.gapPts != null && basis.bandPts != null) {
    return `${pts(Math.abs(basis.gapPts))} points ${GAP_WORDS.apart} in ${when} (band ${pts(basis.bandPts)})`
  }
  if (basis.state === 'level' && basis.bandPts != null) {
    return `${GAP_WORDS.level} in ${when} (band ${pts(basis.bandPts)})`
  }
  return `${GAP_WORDS[basis.state]} in ${when}`
}

/**
 * A window in the reader's words, dated AGAINST the reading it is printed
 * beside.
 *
 * THE YEAR APPEARS EXACTLY WHEN IT MATTERS. House convention prints a bare
 * month ("in June") and that is right while both readings sit in one year; the
 * basis on every wave-1 surface is the immediately preceding period, and the
 * period immediately before January is December OF THE YEAR BEFORE. A January
 * gap printing "19 points apart in December" beside its own month dates the
 * earlier reading to a December a reader will read as this one's — the one
 * thing this product's month rule exists to stop. So the year is printed when
 * the two windows disagree about it, and withheld when they do not.
 *
 * `since` names no month at all, so it carries no year either.
 */
export function periodLabel(window: VerdictWindow, beside?: VerdictWindow | null): string {
  if (window.kind === 'since') return 'the record before this'
  const year = window.from.slice(0, 4)
  const suffix = beside && beside.from.slice(0, 4) === year ? '' : ` ${year}`
  if (window.kind === 'month') return `${longMonth(window.from)}${suffix}`
  return `the ${window.kind} from ${longMonth(window.from)}${suffix}`
}

/**
 * Figure tokens for prose that may NAME the gap.
 *
 * `<prefix>_gap_pts` is emitted ONLY where the gap is `apart`, for the same
 * reason `gapLine` prints it only there: a model handed a magnitude the
 * product refuses to print would name it, and the sentence would then say what
 * the band would not. The four counts are always emitted where the side was
 * read — a level is real whatever the band concluded.
 */
export function gapFigures(gap: Gap, prefix: string): FigureTable {
  const table: FigureTable = {}
  if (gap.state === 'apart' && gap.gapPts != null) {
    table[`${prefix}_gap_pts`] = {
      value: round1(Math.abs(gap.gapPts)),
      unit: 'pts',
      label: `points between ${gap.a.label} and ${gap.b.label} on ${gap.objectLabel}`,
    }
  }
  if (gap.a.observed) {
    table[`${prefix}_you_k`] = { value: gap.a.value.k, unit: 'videos', label: `${gap.a.label} on ${gap.objectLabel}` }
    table[`${prefix}_you_n`] = { value: gap.a.value.n, unit: 'videos', label: `videos in ${gap.a.label}` }
  }
  if (gap.b.observed) {
    table[`${prefix}_them_k`] = { value: gap.b.value.k, unit: 'videos', label: `${gap.b.label} on ${gap.objectLabel}` }
    table[`${prefix}_them_n`] = { value: gap.b.value.n, unit: 'videos', label: `videos in ${gap.b.label}` }
  }
  return table
}

/**
 * A direction over three consecutive gap readings in one clustering regime.
 * `allowed` is `directionWordsFor(reader)` — false everywhere in wave 1, so
 * this returns null on every surface today however clean the readings are.
 *
 * THE WORD IS ABOUT THE GAP'S SIZE, NOT ABOUT EITHER AUDIENCE. `growing` means
 * the two audiences are further apart than they were; `fading` means they are
 * closer — which is the mock's "narrowed", and is the only way this product
 * will ever print that claim. A caller that reads `growing` as "you are
 * growing" has misread the object, which is why `Gap.objectLabel` names the
 * subject and not a side.
 *
 * Every gate `directionWord` (lib/reading/bands.ts) applies, applies here, for
 * the reasons written there:
 *   · three of them, and CONSECUTIVE calendar months — a skipped month breaks
 *     the run rather than being stepped over ("from 19 in June" compares
 *     September to June across two months nobody looked at);
 *   · every reading is an ANSWER (`apart` or `level`). A run that includes a
 *     `too few to compare` month is a run with a hole in it;
 *   · one clustering regime, by `sameRegime`, so two unknown keys are not one;
 *   · ONE PAIR OF AUDIENCES (`GapReading.pair`), which is this module's form of
 *     the "one name" gate: a run that swapped Freitag for Cotopaxi halfway is
 *     three readings of two different questions, and a word drawn across it
 *     describes our tracked list rather than the conversation;
 *   · the two steps agree in raw sign, and the first-to-last change clears a
 *     band drawn across BOTH ENDPOINTS. The move being banded is a
 *     difference-of-differences — the September gap minus the July gap, four
 *     independent proportions — so its band is the two endpoint bands added in
 *     quadrature (each is 2×SE, so sqrt(b₀² + bₙ²) is 2×SE of the move), never
 *     the newest reading's alone. The newest alone is NARROWER than the truth,
 *     which makes the word easier to earn rather than harder, and this is the
 *     one gate in the product where erring costs a direction claim nobody made.
 *     `flat` is the honest answer when three readings exist and do not agree;
 *     `null` when three do not exist.
 */
export function gapDirection(readings: readonly GapReading[], allowed: boolean): Direction | null {
  if (!allowed) return null
  if (readings.length < DIRECTION_RUN) return null
  const tail = readings.slice(readings.length - DIRECTION_RUN)

  for (const r of tail) {
    if (r.window.kind !== 'month') return null
    if (r.state !== 'apart' && r.state !== 'level') return null
    if (r.gapPts == null) return null
  }
  for (let i = 1; i < tail.length; i++) {
    if (monthStartOf(tail[i].window.from) !== nextMonth(tail[i - 1].window.from)) return null
    if (!sameRegime(tail[i].regime ?? null, tail[i - 1].regime ?? null)) return null
    // Two unknown pairs are not one pair, exactly as two unknown regimes are
    // not one regime.
    const pair = tail[i].pair ?? null
    if (pair == null || pair !== (tail[i - 1].pair ?? null)) return null
  }

  const size = tail.map((r) => Math.abs(r.gapPts as number))
  const steps: number[] = []
  for (let i = 1; i < size.length; i++) steps.push(size[i] - size[i - 1])
  const wider = steps.every((s) => s >= 0) && steps.some((s) => s > 0)
  const closer = steps.every((s) => s <= 0) && steps.some((s) => s < 0)
  if (!wider && !closer) return 'flat'

  const first = tail[0].bandPts
  const last = tail[tail.length - 1].bandPts
  if (first == null || last == null) return 'flat'
  const band = round1(Math.max(Math.sqrt(first * first + last * last), SHARE_BAND.minBandPts))
  if (Math.abs(size[size.length - 1] - size[0]) <= band) return 'flat'
  return wider ? 'growing' : 'fading'
}
