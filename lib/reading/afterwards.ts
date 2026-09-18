import { fmtInt, monthName } from '../format'
import { distinctVideos } from '../market-tiles'
import { monthChange } from './bands'
import { monthStartOf } from './monthly'
import type { Counted, ObjectKind, RefusedReason, Verdict } from './verdicts'

// The two columns the advice ledger has never had: what a piece of advice was
// GROUNDED IN, and what the conversation did AFTERWARDS (Phase 1 Block D, D4).
//
// WHY THEY ARE HERE AND NOT IN THE LOADER. Both are readings, and a reading
// that lives inside a page loader is a reading nobody else can check. The
// ledger prints them; the quarterly review prints the same two for the same
// rows; a brief will want them next. One file, one rule, one set of tests.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT "AFTERWARDS" MAY NOT BE.
//
// The mock writes `Afterwards: 9% → 12% since (too few to compare)`. Three
// things are wrong with that arrow and each one is a rule this file keeps:
//
//   1. IT IS A RUN-INDEXED DELTA. Two readings taken at two arbitrary moments
//      of one cumulative corpus is not two periods — a missed week moves the
//      number as much as the conversation does. A period is dated by the
//      COMMENT (AGENTS.md), so both sides come off `month_theme_readings` /
//      `month_subject_readings` through `loadMonthSeries`, and nothing here
//      ever recomputes a share by counting videos over a date span.
//
//   2. IT SUMS MONTHS. "The months after against the months before" is the
//      natural phrasing and the wrong arithmetic: denominators do not add
//      (+38.7% surplus measured over twelve months), so pooling August and
//      September into one "before" side invents a denominator nobody read. A
//      window read that spans months is `window_denominators` /
//      `window_theme_readings`, which this reading does not have and does not
//      fake. So the comparison is TWO MONTH READINGS — the newest readable
//      month after the decision against the newest readable month before it —
//      and the cell names both months so a reader can see exactly which two.
//
//   3. IT PRINTS A MAGNITUDE BESIDE A REFUSAL. `(too few to compare)` with an
//      arrow above it is D2's exact error. Here the band and the change travel
//      together inside one `Verdict` or neither is printed at all.
//
// AND THE CELL IS NEVER BLANK. The mock leaves "—" on three of its five rows.
// A dash in a column headed "Afterwards" reads as "nothing happened", which is
// a claim; the four states below each say which kind of silence this is.
//
// NO DIRECTION WORD, AND NO STATE WORD EITHER. `Afterwards.line` prints the
// two readings and the band and stops. The word for the state — "too few to
// compare", "no clear change" — is the badge vocabulary, which lives in
// `components/delta-badge.tsx` and `lib/calibration.ts` and is changed in ONE
// place (D11). A second copy of it in a lib string is how a product ends up
// with two vocabularies for one thing, which is the defect D11 exists to fix.
// The `Verdict` carries `state`; the surface renders the word.

/** An audience bucket string, mid-sentence.
 *
 *  NOT `readiness/types.ts:audienceLabel`, deliberately, and the two are worth
 *  keeping apart: that one is a column heading in Title Case ("The category",
 *  "Your own brand") and reads wrong inside a sentence — "41 videos in The
 *  category, September". This is the same three buckets as a phrase. */
export function audiencePhrase(audience: string): string {
  if (audience === 'client') return 'your audience'
  if (audience === 'industry-other') return 'the category'
  if (audience.startsWith('competitor:')) return `${audience.slice('competitor:'.length)}’s audience`
  return audience
}

// ── grounded in ───────────────────────────────────────────────────────────────

export interface Grounding {
  /** Distinct videos behind the advice. */
  videos: number
  themes: number
  /**
   * The bucket this grounding is STATED IN — the caller's, echoed back so the
   * afterwards reading beside it is taken in the same one and the two columns
   * cannot drift apart.
   *
   * NOT "the audience this advice is about", which is what this said and is a
   * claim the field cannot support: the cited insights are not scoped to one
   * audience, and the ledger passes one constant (`LEDGER_AUDIENCE`) for every
   * row. Deliberately NOT in `line` for the same reason; see `groundingFor`.
   */
  audience: string
  /**
   * True where the advice cited evidence and NONE of it is still on record.
   *
   * MEASURED, NOT DEFENSIVE. On Sealand 2026-09-18, all twelve of the rows the
   * ledger draws were first made on 28 June, every one of them cites between
   * one and eight `audience_insights` ids, and `prune-stale-analysis` has since
   * removed every single one — so the chain resolves to zero videos on all
   * twelve. Without this flag the ledger's brand-new column would read
   * "0 videos behind it" down the whole page, which is a claim about the
   * evidence where the truth is that a later update replaced it. `line` says
   * the true thing; the flag is so a surface can draw it as an absence rather
   * than as a number.
   */
  pruned: boolean
  /** The count with the population it is a count of, named. */
  line: string
}

export interface GroundingInput {
  /** The evidence rows the advice follows from: `recommendations.based_on`
   *  resolved through `market_insights.evidence.supporting_theme_ids` to the
   *  `audience_insights` ids `videoByInsight` is keyed on. Empty means nothing
   *  was recorded, which is not the same as zero videos. */
  basedOn: readonly string[]
  videoByInsight: Map<string, string | null>
  /** The theme slugs those insights belong to — what the evidence is ABOUT,
   *  counted distinctly. */
  themeIds: readonly string[]
  audience: string
  /** Any day in the month this grounding is being STATED in — the date the
   *  count was taken, not a period it is scoped to. See `groundingFor`. */
  month: string
  /**
   * How many evidence refs the advice RECORDED, before any of them were
   * resolved — `recommendations.based_on.insight_ids.length`.
   *
   * IT IS THE DIFFERENCE BETWEEN TWO ABSENCES, ONE LINK EARLIER. `basedOn`
   * arrives already resolved, so a row whose `market_insights` rows are
   * themselves gone reaches this function as `[]` — indistinguishable from a
   * row that never wrote its evidence down. That is the pruned case wearing
   * the unrecorded label, which is exactly what `pruned` exists to stop one
   * link further on. Omit it and the old reading stands.
   */
  cited?: number
}

/**
 * What a piece of advice is grounded in, counted.
 *
 * THE COUNT IS ALL-TIME AND THE LINE SAYS SO. This is the single thing most
 * easily got wrong here. The mock prints `412 videos` in a column beside a page
 * bar reading "September 2026", and the obvious sentence — "412 videos in the
 * category, September" — is false twice over: `based_on` resolves to
 * `audience_insights` rows from EVERY update this workspace has ever had, so
 * the numerator is the whole corpus, and the denominator a reader supplies from
 * the page bar is one month's. That is mock-gap deviation D8, and it is the
 * same defect `CONCLUSIONS_CORPUS_LINE` already names two blocks higher on this
 * very page. So the line names the population it really is a count of, and the
 * month appears only as the date the count was taken.
 *
 * `audience` is carried on the result and kept OUT of the sentence for the same
 * reason: the cited insights are not scoped to one audience, so "in the
 * category" would be a population this number is not counted over. It is there
 * so the afterwards reading beside it reads the same bucket.
 *
 * NULL, NOT ZERO, WHEN NOTHING IS RECORDED. One of Össur's 56 recommendations
 * carries an empty `based_on` (measured 2026-09-18), and "grounded in 0 videos"
 * is a claim about the evidence where the truth is that we did not write the
 * evidence down. The ledger prints the absence.
 *
 * AND ZERO IS NOT A COUNT EITHER, WHEN THE EVIDENCE WAS PRUNED. This is the
 * case production is entirely in and it was found by looking rather than by
 * reasoning. `prune-stale-analysis` removes `audience_insights` rows a later
 * update has superseded, and Pass D-a replaces its own run's `market_insights`.
 * Measured 2026-09-18: 211 of 334 stored `based_on` refs across both tenants
 * still resolve to a market insight — but on the twelve rows Sealand's ledger
 * actually draws, all first made on 28 June, every cited `audience_insights`
 * row has been pruned, so the chain resolves to zero videos on all twelve. A
 * column reading "0 videos behind it" down a whole page is a claim about the
 * evidence; the truth is that the evidence has been replaced. `pruned` carries
 * that fact and `line` says it.
 */
/** The one sentence for "the evidence was replaced", written once so the two
 *  places that reach it cannot come to say different things. */
const PRUNED_LINE =
  'The evidence this was written from is no longer on record — a later update replaced it, so we cannot count the videos behind it.'

const prunedGrounding = (audience: string): Grounding =>
  ({ videos: 0, themes: 0, audience, pruned: true, line: PRUNED_LINE })

export function groundingFor(input: GroundingInput): Grounding | null {
  const based = [...new Set(input.basedOn)]
  // THE ROW RECORDED EVIDENCE AND NONE OF IT RESOLVED. That is the pruned
  // case, and it reaches here as an empty `basedOn` because the market insight
  // the advice cites is gone too — see `GroundingInput.cited`.
  if (based.length === 0 && (input.cited ?? 0) > 0) return prunedGrounding(input.audience)
  if (based.length === 0) return null

  const themes = new Set(input.themeIds).size
  // `distinctVideos` (lib/market-tiles.ts) IS this count and the brief names it
  // as the helper to use. A hand-rolled second copy has the same semantics
  // today, which is how two copies stop having the same semantics tomorrow.
  const videos = distinctVideos(based, input.videoByInsight)
  const pruned = videos === 0
  const line = pruned
    ? PRUNED_LINE
    : `${fmtInt(videos)} ${videos === 1 ? 'video' : 'videos'} behind it, ` +
      `counted over everything we have read for you up to ${monthName(monthStartOf(input.month))} — not over one month.`
  return { videos, themes, audience: input.audience, pruned, line }
}

// ── afterwards ────────────────────────────────────────────────────────────────

/**
 * Which kind of answer the cell holds.
 *
 * `reading`    two month readings either side of the decision, banded.
 * `too_soon`   the comparison has not accumulated yet — no decision, or fewer
 *              than `minReadings` readable months after it, or nothing readable
 *              before it. The `line` says which.
 * `no_target`  the advice names no identity we can follow, so there is nothing
 *              to read at all. Different from `too_soon`: this one never
 *              resolves on the calendar.
 * `refused`    the comparison could be drawn and must not be — a rename, a
 *              tracking change, a re-grouping, an unlogged era.
 */
export type AfterwardsState = 'reading' | 'too_soon' | 'no_target' | 'refused'

export interface Afterwards {
  state: AfterwardsState
  /** The banded before/after comparison. Null in every state but 'reading'. */
  verdict: Verdict | null
  /** The months read after the decision. */
  months: string[]
  /** The reader's sentence for the cell — never blank, never a dash. */
  line: string
}

export interface AfterwardsInput {
  decidedAt: string | null
  /** The stable identities the advice is about — `theme_registry` ids, a
   *  subject id. Never a label. */
  targetIds: readonly string[]
  /** What kind of identity those are. Defaults to 'theme' because the ledger
   *  reads themes today, but `targetIds` documents a subject id as an accepted
   *  identity and a verdict keyed 'theme' over a subject id files the reading
   *  under the wrong kind — the object is what a record is keyed on. */
  objectKind?: ObjectKind
  /**
   * One point per calendar month, any order; `k` of `n` distinct videos.
   *
   * `clusteringKey` and `audience` ride along because the comparison is drawn
   * by `monthChange`, which is where the like-for-like rules live: two months
   * grouped by two clusterings earn `clustering_changed`, a pair nobody
   * recorded a grouping for earns `clustering_unknown` — which is every month
   * frozen before the fingerprint shipped — and two names for one audience
   * refuse the comparison outright. A caller that drops them is not making a
   * comparison with nothing to caveat; it is making one it cannot caveat, and
   * `flags: []` would be a positive claim that there is nothing to say.
   */
  series: readonly {
    month: string
    k: number
    n: number
    clusteringKey?: string | null
    audience?: string | null
  }[]
  audience: string
  minReadings?: number
  /** What a reader is shown for the target. Added beside the pinned fields
   *  because `Verdict.objectLabel` is required and is not derivable from an
   *  id — a label is never a key, and an id is never a label. */
  objectLabel?: string
  /** Draw no comparison and say why. The loader knows about renames and
   *  clustering breaks; this function only knows months. Added beside the
   *  pinned fields so the `refused` state has a producer. */
  refused?: RefusedReason
}

/** How many readable months after the decision before a comparison is drawn. */
export const AFTERWARDS_MIN_READINGS = 2

const REFUSED_LINE: Record<RefusedReason, string> = {
  unlogged_era: 'We cannot read this one afterwards: part of the stretch either side of your decision is from before we kept a record of what we were tracking.',
  tracking_change: 'We cannot read this one afterwards: what we were tracking changed between the two months, so the two sides are not the same question.',
  clustering_changed: 'We cannot read this one afterwards: the two months were grouped differently, so a comparison would be about our grouping rather than about the conversation.',
  rename: 'We cannot read this one afterwards: the audience either side of your decision was renamed, and the months before the rename stay under the old name.',
}

/**
 * What the conversation did after a decision — the ledger's last column.
 *
 * TWO MONTH READINGS, NOT A POOL. See the file header, point 2: the newest
 * readable month strictly AFTER the decision's own month against the newest
 * readable month strictly BEFORE it.
 *
 * THE DECISION'S OWN MONTH IS NEITHER SIDE. A decision made on 2 September
 * straddles September: the comments dated before it and after it are in one
 * month row and cannot be separated, so counting September as "after" credits
 * the advice with conversation that happened before anybody acted. It is left
 * out of both sides and named in the line.
 */
export function afterwardsFor(input: AfterwardsInput): Afterwards {
  const minReadings = input.minReadings ?? AFTERWARDS_MIN_READINGS
  const where = audiencePhrase(input.audience)

  if (input.refused) {
    return { state: 'refused', verdict: null, months: [], line: REFUSED_LINE[input.refused] }
  }
  // THE DECISION IS ASKED ABOUT FIRST, AND THE ORDER IS THE WHOLE ANSWER ON
  // TODAY'S DATA. Targets resolve only through the current themed run's
  // `themes.supporting_insight_ids`, and Sealand's twelve drawn rows were all
  // written in June from `audience_insights` rows `prune-stale-analysis` has
  // since removed — so every one of them resolves to no target. Asking about
  // targets first printed "this advice does not name a subject or a theme we
  // follow" down the whole page: a claim about the ADVICE, where the truth is
  // that nobody has decided on it yet and the evidence behind it was replaced
  // — the distinction `Grounding.pruned` carries one column to the left. An
  // undecided row's answer resolves on the calendar; `no_target` never does,
  // and it is the wrong silence to print about a row nothing has been decided
  // for.
  if (!input.decidedAt) {
    return {
      state: 'too_soon',
      verdict: null,
      months: [],
      line: 'You have not decided on this one yet. We start reading the month after you do.',
    }
  }
  if (input.targetIds.length === 0) {
    return {
      state: 'no_target',
      verdict: null,
      months: [],
      line: 'This advice does not name a subject or a theme we follow month by month, so there is nothing to read afterwards.',
    }
  }

  const decidedMonth = monthStartOf(input.decidedAt.slice(0, 10))
  const readable = [...input.series]
    .filter((p) => p.n > 0)
    .sort((a, b) => monthStartOf(a.month).localeCompare(monthStartOf(b.month)))
    .map((p) => ({
      month: monthStartOf(p.month),
      value: { k: p.k, n: p.n } as Counted,
      // Carried to `monthChange`, which is what decides the caveats.
      point: { month: monthStartOf(p.month), videos: p.n, k: p.k, clusteringKey: p.clusteringKey, audience: p.audience },
    }))

  const after = readable.filter((p) => p.month > decidedMonth)
  const before = readable.filter((p) => p.month < decidedMonth)
  const months = after.map((p) => p.month)

  if (after.length < minReadings) {
    const have = after.length
    return {
      state: 'too_soon',
      verdict: null,
      months,
      line:
        `${have === 0 ? 'No month' : have === 1 ? 'One month' : `${fmtInt(have)} months`} has been read in ${where} since you decided this, ` +
        `and we compare from ${fmtInt(minReadings)}. ${monthName(decidedMonth)} itself is in neither side — ` +
        // A decision dated the 1st was not made partway through anything. The
        // month is still left out of both sides, and the reason is the same
        // one either way: the decision sits inside it.
        //
        // "SITS", NOT "FALLS" (E-content fix pass, wave 2). `falls` is on the
        // shared movement list (lib/calibration.ts DIRECTION_WORDS), so this
        // sentence — code's own, unmarked, and printed on every ledger row
        // decided on the 1st with fewer than two readings since — failed copy
        // contract rule (c) on any block that renders it. Nothing here claims a
        // direction; the word was the whole violation.
        `${input.decidedAt.slice(8, 10) === '01' ? 'your decision sits at the start of it' : 'you decided partway through it'}.`,
    }
  }
  if (before.length === 0) {
    return {
      state: 'too_soon',
      verdict: null,
      months,
      line: `There is no month in ${where} before you decided this to compare the months since against.`,
    }
  }

  const now = after[after.length - 1]
  const then = before[before.length - 1]
  // THE PRODUCT'S ONE MONTH-AGAINST-MONTH RULE, NOT A SECOND ONE. This called
  // `bandVerdict` directly, which meant two things a reader needs went missing.
  // The caveats: `monthChange` attaches `clustering_changed` where the two
  // months were grouped differently and `clustering_unknown` where nobody
  // recorded a grouping — which on today's corpus is every frozen month — and
  // refuses outright where the audience either side is two names. Shipping
  // `flags: []` said there was nothing to caveat, which is a claim, not a
  // silence. And the window: it was `{ from: m, to: m }`, an EMPTY half-open
  // interval, where every other producer in the codebase writes
  // `[monthStart, nextMonth)`.
  const verdict = monthChange({
    object: {
      kind: input.objectKind ?? 'theme',
      id: input.targetIds[0],
      label: input.objectLabel ?? input.targetIds[0],
    },
    audience: input.audience,
    curr: now.point,
    prev: then.point,
  })

  // A REFUSAL IS AN ANSWER, AND IT IS THE CELL'S. `monthChange` refuses a
  // rename; the comparison it would have drawn is not printed beside it.
  if (verdict.refusedReason) {
    return { state: 'refused', verdict: null, months, line: REFUSED_LINE[verdict.refusedReason] }
  }

  // THE NUMBERS AND THE BAND, AND NOT A WORD FOR THEM. See the file header's
  // last paragraph: the state's word is the badge's, changed once, and a
  // second copy of that vocabulary in this string is the defect D11 fixes.
  const band = verdict.bandPts == null ? '' : ` · band ${verdict.bandPts.toFixed(1)} points`
  const line =
    `${fmtInt(now.value.k)} of ${fmtInt(now.value.n)} videos in ${where} in ${monthName(now.month)}, ` +
    `against ${fmtInt(then.value.k)} of ${fmtInt(then.value.n)} in ${monthName(then.month)}${band}.`

  return { state: 'reading', verdict, months, line }
}
