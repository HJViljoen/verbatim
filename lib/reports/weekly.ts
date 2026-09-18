import { MAX_FLAGS, baselineLabel, type ThinUpdateReason } from '../reading/anomaly'
import { fmtInt, fmtPct, fullDate, shortDate } from '../format'
import { longMonth } from '../format'
import { PRIVACY_LINE, platformShareLine } from '../reading/method'
import { prevMonth } from '../reading/month-key'
import { mergeFigures } from '../blocks/types'
import type { FigureTable } from '../reading/verdicts'
import type { Quote } from '../renderables/types'

/**
 * The weekly report — the arrangement, and the first screen's model
 * (Phase 1 WP17, design §3 Artefact WR, item 41).
 *
 * WHAT THIS FILE IS. The weekly report is an ARRANGED REPORT OVER BLOCK KEYS:
 * six sections, each a `Block<D>` rendered in `'email'` mode at 640 (decision
 * D15, the mock's width). This module holds the part of it that is pure — the
 * key order, the rule printed on the artefact, the subject line, and the typed
 * model of section 1 with the budget that binds it. The loader is
 * `lib/pages/weekly.ts`; the blocks are `components/blocks/weekly/*`; the
 * document is `components/email/weekly.tsx`.
 *
 * THE RULE THAT KEEPS IT HONEST IS PRINTED ON THE ARTEFACT, not held in a
 * comment: every number on this report is the month so far against the three
 * months before it, and the week is how much of it arrived since the last
 * update. One update's window holds ~117 videos and ~7 of your own — nothing
 * about a brand can be read weekly at all — so a weekly report built any other
 * way is the run-indexed reading the whole design exists to remove
 * (final-v3 §2, "A third consequence").
 *
 * THE ONE WEEKLY VERDICT IS SECTION 1'S ANOMALY CHECK, and it is a statement
 * about whether the week is unusual against three months, never a statement
 * about the week on its own.
 */

/**
 * The six sections, by key, in the design's order.
 *
 * A KEY IS A STORED CONTRACT, exactly as a renderable key is: it names a
 * section inside a built report, a PNG the runner renders, and a row in a
 * schedule's stored arrangement. Renaming one orphans every artefact that
 * named it — which is why `scripts/migrate-schedule-keys.ts` exists rather
 * than a rename.
 */
export const WEEKLY_BLOCK_KEYS = [
  'weekly.week',
  'weekly.subjects',
  'weekly.incoming',
  'weekly.sales',
  'weekly.content',
  'weekly.coverage',
] as const

export type WeeklyBlockKey = (typeof WEEKLY_BLOCK_KEYS)[number]

/** The mock's width (`mock-sealand/spec/artboards.md`), against the digest's
 *  shipped 600. The digest keeps its own width; this is the weekly report's. */
export const WEEKLY_EMAIL_WIDTH = 640

/**
 * What to call the window this report covers.
 *
 * "THIS WEEK" IS NOT ALWAYS TRUE. Sealand's frozen window is 2026-08-11 →
 * 2026-09-10 — thirty days — because that is its cadence, and the artefact said
 * "this week" in five of its six headings and in its subject line over it. The
 * masthead already prints the real dates, which is what the design asks for;
 * the words around them should not contradict them.
 *
 * So the word comes off the window. A window this long or shorter is a week; a
 * longer one is called what it certainly is, an update. An update with no
 * recorded window keeps "week": the span is unknown, the artefact's own name is
 * the weekly report, and every line about a missing window says so in full
 * rather than leaning on this word.
 */
export const WEEKLY_WINDOW_DAYS = 10

export type PeriodNoun = 'week' | 'update'

export function periodNounFor(window: { from: string; to: string } | null): PeriodNoun {
  if (!window) return 'week'
  const days = (Date.parse(`${window.to}T00:00:00.000Z`) - Date.parse(`${window.from}T00:00:00.000Z`)) / 86_400_000
  return Number.isFinite(days) && days > WEEKLY_WINDOW_DAYS ? 'update' : 'week'
}

/** "this week" / "in this update" — the phrase, because the two nouns do not
 *  take the same preposition and half-substituted English is worse than either. */
export const inPeriod = (noun: PeriodNoun): string => (noun === 'week' ? 'this week' : 'in this update')

/** Printed under the masthead, every week, in the design's own words.
 *
 *  The 'week' arm, and the constant every caller that has no window still
 *  reaches for. The second sentence takes the noun — see `weeklyRuleFor`. */
export const WEEKLY_RULE =
  'Every number below is this month so far, against the three months before it. ' +
  'The week is how much of it arrived since the last update.'

/**
 * The masthead rule in the word this update's window supports.
 *
 * THE RULE WAS THE LAST FIXED "WEEK" IN THE ARTEFACT, and the most printed one:
 * twice in the app and email modes and SEVEN times in the print deck, once in
 * every page footer. Sealand's frozen window is thirty days, so "The week is how
 * much of it arrived since the last update" sat under a masthead reading
 * "11 Aug – 10 Sep". `periodNounFor` was written for exactly this and the
 * headings already adapt; this string did not.
 */
export const weeklyRuleFor = (noun: PeriodNoun): string =>
  noun === 'week'
    ? WEEKLY_RULE
    : 'Every number below is this month so far, against the three months before it. ' +
      'This update is how much of it arrived since the last one.'

/**
 * The first screen's budget (design §3 WR section 1: "Budget: 12 printed
 * numbers on this screen").
 *
 * COUNTED OVER A TYPED MODEL, not over rendered digits. The alternative — a
 * render-time count of mono nodes — cannot be asserted before the markup
 * exists, cannot tell a figure from a date, and would have to be re-derived
 * every time the markup moved. So section 1 is composed as DATA
 * (`Section1`), its figures are declared (`section1Figures`), and the budget
 * is a test over that table.
 *
 * WHY IT BINDS AT EXACTLY TWELVE. The sentence declares three figures — the
 * headline share, the videos it is a share of, and the same share at this point
 * last month, which is the design's own sentence to the number — and each flag
 * declares three (this week's share, the baseline's share, the movement).
 * `MAX_FLAGS` is three. 3 + 3×3 = 12: the budget is the rule that already
 * governs the check, said in the reader's units, and adding a fourth figure
 * anywhere costs a flag.
 *
 * A DATE IS NOT A FIGURE. "September, 18 days in" and "6–13 Sep" are the
 * reading's stamp, not readings of the conversation — the same line WP11 drew
 * on Overview's moves block, where "the one number in a move's line is a date".
 *
 * NOR IS A DENOMINATOR, OR A BAND. The copy contract REQUIRES a level to print
 * its "of N" (rule (b)) and this product never prints a change without the band
 * it cleared; both are the evidence a figure must carry to be readable at all,
 * and counting them would make the honest rendering of one reading cost three
 * of the budget. The budget counts READINGS — the same line WP11 drew when it
 * declared OV2's three sides per row as one figure each against thirty.
 */
export const FIRST_SCREEN_BUDGET = 12

/** What the sentence costs, and what one flag costs. Stated so the arithmetic
 *  above is checkable rather than asserted. */
export const SENTENCE_FIGURES = 3
export const FLAG_FIGURES = 3

// ---- Section 1, as data -------------------------------------------------------

/**
 * Why the check did not compare this week — or that it did.
 *
 * SIX STATES, AND THE POINT IS THAT THEY ARE SIX. "We did not look" and
 * "nothing was unusual" read identically to a reader who is only shown silence,
 * which is the seam `anomaly_checks` was added to close (WP8). The weekly
 * report is the surface that seam was closed for.
 */
export type WeekCheckState =
  /** Something cleared both gates. */
  | 'flagged'
  /** The check ran and nothing cleared. */
  | 'nothing_unusual'
  /** Fewer than three trailing months clear the floor. */
  | 'baseline_forming'
  /** A thin, failed or stalled update: the check was suppressed, with why. */
  | 'suppressed'
  /** The update carries no recorded window, so no week could be cut. */
  | 'no_window'
  /** M7 is not applied here: the check has never been recorded. */
  | 'not_recorded'

/** One flag, as the artefact prints it. Counts and labels — never a word
 *  anybody wrote; the quotes travel as refs and resolve at render. */
export interface WeekFlag {
  objectKind: string
  /** Plain words, never an id (`anomaly_flags.label`). */
  label: string
  /** What the share is a share OF, printed beside it. */
  denominator: string
  weekK: number
  weekN: number
  baselineK: number
  baselineN: number
  changePts: number
  bandPts: number
  /** The model's explanation, sentence by sentence, figure tokens intact.
   *  Empty where no draft survived the scrubbers — the slot then says so. */
  sentences: string[]
  /** The explanation's evidence. `text` is emptied on freeze and resolved at
   *  render, so an erased voice is gone from a stored artefact at the next
   *  look (lib/renderables/quotes-freeze.ts). */
  quotes: Quote[]
  href: string
}

/** The check, as the artefact prints it. */
export interface WeekCheck {
  state: WeekCheckState
  /** What this update's window may be called — carried here so the check's
   *  line, the subject that repeats it and the blocks that frame it cannot
   *  disagree about the word. */
  noun: PeriodNoun
  /** The one line for this state, in the reader's words. */
  line: string
  /** "baseline forming — 2 of 3 months", on the forming state only. */
  baseline: string | null
  /** Why the check was suppressed, machine-readable, on `suppressed` only. */
  reason: ThinUpdateReason | null
  flags: WeekFlag[]
  /** Flags that cleared but are not printed — the cap, or the budget. */
  moreFlags: number
}

/** The code sentence: where the month stands, against the same point last
 *  month. Figure tokens, substituted by the block at render. */
export interface WeekSentence {
  body: string
  figures: FigureTable
}

/** Section 1 in full — "The week in one sentence, and anything unusual". */
export interface Section1 {
  month: string
  /** Days of the month elapsed at the reading; null on a complete month. */
  daysIn: number | null
  /** The update's own window, `YYYY-MM-DD`, or null where none is recorded. */
  window: { from: string; to: string } | null
  sentence: WeekSentence
  check: WeekCheck
}

// ---- The sentence -------------------------------------------------------------

export interface WeekSentenceInput {
  month: string
  daysIn: number | null
  /** The object the month's headline quantity is about — a theme, a subject,
   *  or the pooled slice when nothing has been named. */
  label: string
  /** A stable key fragment; ids are prefixed because a token beginning with a
   *  digit never substitutes (WP11 surprise 1). */
  objectId: string
  /** The audience the share is a share of, as a NOUN — "the category", "your
   *  own brand" (`audienceInLabel`). Not the possessive `audienceInSentence`
   *  form: "of 388 videos in the category's videos" says videos twice. */
  audience: string
  k: number
  n: number
  /** The same point last month, or null where M3 cannot answer the window. */
  atLastMonth: { k: number; n: number } | null
}

const pctOf = (k: number, n: number): number => (n > 0 ? Math.round((k / n) * 1000) / 10 : 0)

/** `o_<id>_<suffix>` — the prefix is what makes a uuid-keyed token substitute. */
export const weekFigureKey = (objectId: string, suffix: string): string =>
  `o_${objectId.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${suffix}`

/**
 * "September, 18 days in: the category's durability conversation is running at
 * [[share]] of [[of]] videos, against [[last]] at this point in August."
 *
 * THREE FIGURES, AND THE LAST CLAUSE IS TWO SENTENCES. Where the window
 * function cannot answer the same point last month — which is every tenant
 * until M3 is applied — the clause says so rather than being dropped, because
 * a reader who is shown one number and no comparison has no way to know
 * whether the comparison was refused or never asked for.
 */
export function weekSentence(input: WeekSentenceInput): WeekSentence {
  const share = weekFigureKey(input.objectId, 'share')
  const of = weekFigureKey(input.objectId, 'of')
  const figures: FigureTable = {
    [share]: { value: pctOf(input.k, input.n), unit: 'pct', label: `${input.label} — share of the month so far` },
    [of]: { value: input.n, unit: 'videos', label: `videos read for ${input.audience} this month` },
  }
  const name = longMonth(input.month)
  const stamp = input.daysIn == null ? `${name}, complete` : `${name}, ${input.daysIn} ${input.daysIn === 1 ? 'day' : 'days'} in`
  // THE NUMERATOR IS NOT PRINTED, and that is the design's own sentence: "the
  // category's durability conversation is running at 24% of 271 videos". The
  // level carries its "of how many", which is what the calibration rule asks
  // for; a fourth number here would cost a flag on the first screen.
  const head = `${stamp}: ${input.label} is running at [[${share}]] of [[${of}]] videos read for ${input.audience}`

  if (!input.atLastMonth) {
    return { body: `${head}. At this point last month: not recorded yet.`, figures }
  }
  const last = weekFigureKey(input.objectId, 'last')
  figures[last] = {
    value: pctOf(input.atLastMonth.k, input.atLastMonth.n),
    unit: 'pct',
    label: `${input.label} — share at this point last month`,
  }
  return { body: `${head}, against [[${last}]] at this point in ${longMonth(prevMonth(input.month))}.`, figures }
}

// ---- The check's own sentence -------------------------------------------------

/** Printed when nothing cleared. The design asks for this one in full, because
 *  section 1 is where the reader came with the question — unlike OV1, where a
 *  weekly reassurance would train the reader to skip the block. */
export const NOTHING_UNUSUAL = 'Nothing unusual this week.'

/** The same line, in the word this update's window supports. */
export const nothingUnusualLine = (noun: PeriodNoun): string =>
  noun === 'week' ? NOTHING_UNUSUAL : 'Nothing unusual in this update.'

/** The coda after a flag: it was the only one. The same line the quiet state
 *  prints, in the position the artboard puts it — after the card, not instead
 *  of it. */
export const nothingElseUnusual = (noun: PeriodNoun): string =>
  noun === 'week' ? 'Nothing else unusual this week.' : 'Nothing else unusual in this update.'

/**
 * "271 videos this update · 2,359 in September so far" — WR1's meta.
 *
 * THE MOCK'S "n = 312 videos this week", WITH THE CONTRIBUTION RESTATEMENT
 * (mock-gap §6 D6). A week-only n at the top of the first screen is the
 * run-indexed reading in one clause; the month beside it is what stops a
 * reader taking the update for a period. Where the month is not recorded the
 * half that is true is printed alone, and the clause that would have been a
 * zero is simply absent.
 *
 * NOT A NEW FIGURE. Both counts are WR3's `update_videos` / `month_videos`,
 * declared there and restated here; nothing on the first screen declares a
 * thirteenth token against the budget.
 */
export function updateMeta(gathered: number, monthVideos: number | null, month: string): string {
  const head = `${fmtInt(gathered)} ${gathered === 1 ? 'video' : 'videos'} this update`
  return monthVideos == null ? head : `${head} · ${fmtInt(monthVideos)} in ${longMonth(month)} so far`
}

export const CHECK_NOT_RECORDED =
  'The weekly check is not recorded for this workspace yet.'

/** The same line, in the word this update's window supports. */
export const checkNotRecorded = (noun: PeriodNoun): string =>
  noun === 'week' ? CHECK_NOT_RECORDED : 'This update’s check is not recorded for this workspace yet.'

export const CHECK_NO_WINDOW =
  'This update does not record the days it covered, so no week could be cut out of it and nothing was compared.'

/** Printed when `anomaly_checks` says the check flagged and no flag row could
 *  be read beside it. Not "nothing unusual" — the check fired — and not a count
 *  of zero things, which `flaggedLine(0)` would have said. */
export const checkFlaggedNoDetail = (noun: PeriodNoun): string =>
  `Something ${inPeriod(noun)} cleared the band, and what it was is not recorded.`

export const CHECK_FLAGGED_NO_DETAIL = checkFlaggedNoDetail('week')

export interface WeekCheckInput {
  state: WeekCheckState
  flags: WeekFlag[]
  /** How many cleared both gates, which can exceed what is printed. */
  flaggedCount?: number
  /** Months of the trailing three that clear the floor, on the forming state. */
  monthsClearing?: number
  /** The suppression's own calibrated sentence and reason (`thinUpdate`). */
  suppression?: { reason: ThinUpdateReason | null; note: string | null } | null
  /** What this update's window may be called (`periodNounFor`). Defaults to
   *  the artefact's own word. */
  noun?: PeriodNoun
}

/**
 * The check, composed — and trimmed to the budget.
 *
 * THE BUDGET IS ENFORCED HERE rather than asserted in a test alone, because a
 * budget that only fails a test is a budget that ships broken the first time a
 * fourth flag clears. Flags are dropped from the tail (they arrive largest
 * first) until the first screen fits, and what was dropped is counted so the
 * block can say so.
 */
export function weekCheck(input: WeekCheckInput): WeekCheck {
  const cleared = input.flaggedCount ?? input.flags.length
  const noun = input.noun ?? 'week'
  if (input.state === 'flagged') {
    const room = Math.max(0, Math.floor((FIRST_SCREEN_BUDGET - SENTENCE_FIGURES) / FLAG_FIGURES))
    const shown = input.flags.slice(0, Math.min(room, MAX_FLAGS))
    // "0 things this week are unusual" was reachable: the arm is entered on the
    // state alone, so an `outcome = 'flagged'` row whose `anomaly_flags` read
    // came back empty printed a count of nothing. The check still fired, so the
    // honest line says that and not the quiet one.
    return {
      state: 'flagged',
      noun,
      line: shown.length > 0 ? flaggedLine(shown.length, noun) : checkFlaggedNoDetail(noun),
      baseline: null,
      reason: null,
      flags: shown,
      moreFlags: Math.max(0, cleared - shown.length),
    }
  }
  if (input.state === 'suppressed') {
    return {
      state: 'suppressed',
      noun,
      line: input.suppression?.note ?? `The months behind this one were not compared with ${inPeriod(noun)}.`,
      baseline: null,
      reason: input.suppression?.reason ?? null,
      flags: [],
      moreFlags: 0,
    }
  }
  if (input.state === 'baseline_forming') {
    const months = input.monthsClearing ?? 0
    return {
      state: 'baseline_forming',
      noun,
      line: `${baselineLabel(months)}. The check starts flagging once three months carry enough conversation to compare against.`,
      baseline: baselineLabel(months),
      reason: null,
      flags: [],
      moreFlags: 0,
    }
  }
  if (input.state === 'no_window') {
    return { state: 'no_window', noun, line: CHECK_NO_WINDOW, baseline: null, reason: null, flags: [], moreFlags: 0 }
  }
  if (input.state === 'not_recorded') {
    return { state: 'not_recorded', noun, line: checkNotRecorded(noun), baseline: null, reason: null, flags: [], moreFlags: 0 }
  }
  return { state: 'nothing_unusual', noun, line: nothingUnusualLine(noun), baseline: null, reason: null, flags: [], moreFlags: 0 }
}

function flaggedLine(n: number, noun: PeriodNoun): string {
  return n === 1
    ? `One thing ${inPeriod(noun)} is unusual against the three months behind it.`
    : `${fmtInt(n)} things ${inPeriod(noun)} are unusual against the three months behind them.`
}

// ---- The budget ---------------------------------------------------------------

/** One flag's three declared figures. */
export function flagFigures(flag: WeekFlag, index: number): FigureTable {
  const n = index + 1
  return {
    [`flag_${n}_week_share`]: { value: pctOf(flag.weekK, flag.weekN), unit: 'pct', label: `${flag.label} — share of the week` },
    [`flag_${n}_baseline_share`]: { value: pctOf(flag.baselineK, flag.baselineN), unit: 'pct', label: `${flag.label} — share across the three months behind it` },
    [`flag_${n}_change`]: { value: flag.changePts, unit: 'pts', label: `${flag.label} — the movement, against a band of ${flag.bandPts}` },
  }
}

/**
 * Which of the weekly artefact's tokens are a reading of its MONTH.
 *
 * `sent_figures.month` is NOT NULL, and M9's own comment says why: "a figure
 * with no period is the run-indexed reading this whole phase exists to remove".
 * A week's share filed under September is a period key that is WRONG rather
 * than absent, which is worse — WP19's archive groups by month, and nothing in
 * the row shape says "this one is not a month". The denominator column carries
 * the label, which saves a careful reader; a careful reader is not a guard.
 *
 * FOUR SHAPES ARE NOT THE MONTH, and each says so in its own label: a flag's
 * share of the WEEK, the same flag's share across the THREE MONTHS behind it,
 * the movement between those two, and the videos THIS UPDATE gathered. A fifth
 * is a reading of the month BEFORE this one — "share at this point last month"
 * — which is a real period key and not this row's.
 *
 * A PREDICATE, NOT A LIST AT THE CALL SITE: a new token is recorded by default
 * and a new week-scoped one has to be named here, which is the way round that
 * fails loudly.
 */
export function isMonthScopedFigure(token: string): boolean {
  if (token === 'update_videos') return false
  if (/^flag_\d+_(week_share|baseline_share|change)$/.test(token)) return false
  if (/^o_.+_last$/.test(token)) return false
  return true
}

/** The same table with what is not a reading of the month removed. FOR THE
 *  RECORD ONLY — the artefact still prints every one of them. */
export function monthScopedFigures(figures: FigureTable): FigureTable {
  const out: FigureTable = {}
  for (const [token, figure] of Object.entries(figures)) {
    if (isMonthScopedFigure(token)) out[token] = figure
  }
  return out
}

/** Every number section 1 puts in front of a reader, by token. */
export function section1Figures(s: Section1): FigureTable {
  return mergeFigures([s.sentence.figures, ...s.check.flags.map((f, i) => flagFigures(f, i))])
}

/** How many. The budget is `FIRST_SCREEN_BUDGET`. */
export function firstScreenCount(s: Section1): number {
  return Object.keys(section1Figures(s)).length
}

/** Does section 1 fit? False is a bug, not a caveat — `weekCheck` trims. */
export function withinFirstScreenBudget(s: Section1): boolean {
  return firstScreenCount(s) <= FIRST_SCREEN_BUDGET
}

// ---- The masthead -------------------------------------------------------------

/** "6 – 13 Sep", or the month so far where the update records no window. */
export function weeklyPeriod(window: { from: string; to: string } | null, month: string): string {
  if (!window) return `${longMonth(month)} so far`
  return `${shortDate(window.from)} – ${shortDate(window.to)}`
}

/**
 * "Verbatim · weekly · update of 27 Sep" — the artboard's eyebrow
 * (`weekly.eyebrow`, block D wave 2).
 *
 * THE ARTEFACT IS NAMED AND THE UPDATE IS DATED, which is what the mock puts
 * here and what the built eyebrow did not: it printed the tenant and the
 * product category (`Sealand · consumer intelligence`), so a reader with three
 * Verbatim emails open could not tell which artefact or which week they were
 * in. The TENANT moves to the right end of the date line, where the mock has
 * it.
 *
 * "weekly" IS THE ARTEFACT'S NAME, NOT A CLAIM ABOUT THE WINDOW. Sealand's
 * window is thirty days and every line that describes the window takes
 * `periodNounFor`; this one names the report a reader subscribed to, and the
 * update's own date sits beside it so the two cannot be confused.
 *
 * `27 September` in the mock, `27 Sep` here: the product has ONE short date
 * form (`shortDate`), and a second one invented for a single line is how
 * "16 Sept" came to sit under "Sep" in the deck footer.
 */
export function weeklyEyebrow(updateDate: string | null): string {
  return updateDate ? `Verbatim · weekly · update of ${shortDate(updateDate)}` : 'Verbatim · weekly'
}

/**
 * "6 – 13 Sep · previous update 30 Aug" — the left half of the masthead's
 * two-ended row (`weekly.daterange`).
 *
 * THE PREVIOUS UPDATE IS BOUND RATHER THAN DROPPED. The mock prints it and the
 * gap note recorded "no field on this artefact" — but `latestRuns` already
 * reads this tenant's last nine delivered runs for the thin gate, so the one
 * behind this one costs no query at all. It is the same expression This week's
 * `WeekUpdate.previous` uses, and a first update SAYS it is one rather than
 * leaving the clause off: "no previous update" is the reason such a report has
 * nothing behind it to be read against.
 */
export function weeklyDateLine(period: string, previous: string | null): string {
  return `${period} · ${previous ? `previous update ${shortDate(previous)}` : 'no previous update'}`
}

/**
 * One link per section, at the foot of the artefact (`weekly.s6.links`).
 *
 * THE MOCK LISTS SIX AND THIS PRODUCT HAS FOUR SURFACES BEHIND THEM. §1, §3
 * and §5 all open This week, and printing one destination three times under
 * three names teaches a reader there are three places to go. So the list is
 * DEDUPED BY HREF and the label that survives is the first section that
 * pointed there.
 *
 * IT NAMES ONLY THE SECTIONS THIS ARTEFACT DREW. A stored arrangement may name
 * fewer (`WeeklySnapshotData.keys`), and a link to a section the reader never
 * saw is a promise about a report that was not sent.
 *
 * DOCUMENT CHROME, NOT WR6's. The mock draws it inside §6, immediately above
 * the buttons — which are the document's — and it is a map OF the artefact, so
 * it is composed where the arrangement is known and rendered by the document.
 */
export function weeklyLinks(input: {
  noun: PeriodNoun
  keys: readonly string[]
  /** Where the flag's own "see the week" points, when there is a flag. */
  flagHref: string | null
  weekHref: string
  subjectsHref: string
  briefHref: string
  recordHref: string
}): { key: WeeklyBlockKey; label: string; href: string }[] {
  const wanted: { key: WeeklyBlockKey; label: string; href: string }[] = [
    { key: 'weekly.week', label: `Unusual ${inPeriod(input.noun)}`, href: input.flagHref ?? input.weekHref },
    { key: 'weekly.subjects', label: 'Your subjects', href: input.subjectsHref },
    { key: 'weekly.incoming', label: 'What came in', href: input.weekHref },
    { key: 'weekly.sales', label: 'For sales', href: input.briefHref },
    { key: 'weekly.content', label: 'For content', href: input.weekHref },
    { key: 'weekly.coverage', label: 'The record', href: input.recordHref },
  ]
  const seen = new Set<string>()
  return wanted.filter((l) => {
    if (!input.keys.includes(l.key)) return false
    if (seen.has(l.href)) return false
    seen.add(l.href)
    return true
  })
}

/**
 * The three mono lines at the foot (`weekly.footer`).
 *
 * WHAT THE MOCK ASKS FOR, MINUS ONE CLAUSE. Prepared-by · the update's date ·
 * the platform mix · the privacy sentence. "next update 4 Oct" is NOT here:
 * nothing in this product computes a next update date — a schedule's cadence
 * is not a promise about when a run will land — and a date printed in an email
 * a client can hold up is a promise.
 *
 * "PREPARED FOR", NOT "BY", and that is argued in `components/email/weekly.tsx`:
 * this artefact is sent to the client's own staff, and only a share link is a
 * document the client forwards under their own name.
 *
 * THE MIX IS THIS UPDATE'S OWN AND SAYS SO. The mock prints a bare
 * "TikTok 38% · YouTube 29% …" under a footer whose other line is dated by the
 * update; the record's mix (WR6) is the MONTH's, and two mixes with no label
 * between them is how one share comes to mean two things (D15). The line is
 * composed by `platformShareLine`, the one renderer of a mix as percentages.
 */
export interface WeeklyFooterLines {
  prepared: string
  /** Null where this update gathered nothing, or recorded no platform. */
  mix: string | null
  privacy: string
}

export function weeklyFooterLines(input: {
  company: string
  updateDate: string | null
  readingAt: string
  platforms: readonly { platform: string; videos: number }[]
}): WeeklyFooterLines {
  const mixOf: Record<string, number> = {}
  let videos = 0
  for (const p of input.platforms) {
    mixOf[p.platform] = (mixOf[p.platform] ?? 0) + p.videos
    videos += p.videos
  }
  const share = platformShareLine(mixOf)
  return {
    prepared: [
      `Prepared for ${input.company} · with Verbatim`,
      input.updateDate ? `update of ${fullDate(input.updateDate)}` : null,
      `read ${fullDate(input.readingAt)}`,
    ].filter((s): s is string => s != null).join(' · '),
    mix: share ? `${share} — this update’s ${fmtInt(videos)} ${videos === 1 ? 'video' : 'videos'}` : null,
    privacy: PRIVACY_LINE,
  }
}

/**
 * The subject line.
 *
 * NO DIRECTION WORD AND NO BARE WEEKLY FIGURE. A subject line is read before
 * any of the apparatus that makes a number mean something, so it names the
 * flagged OBJECT when the check fired and otherwise says what the artefact is.
 * The month's own share is not put in it: a level with no denominator beside
 * it is exactly the number the calibration rule forbids.
 *
 * SIX STATES, SIX SUBJECTS — and that is the whole point of the six. This
 * string is the email's subject AND the artefact's `h1` (the email masthead,
 * the share page's heading, the deck's title), so a state that falls through to
 * "nothing unusual this week" prints a reassurance over a body that says the
 * check never ran. It did exactly that on Össur: `not_recorded` three lines
 * under a headline claiming nothing was unusual. `weekCheck` already refuses to
 * let "we did not look" and "nothing was unusual" share a line
 * (`WeekCheckState`); the subject may not undo it by sharing a sentence.
 *
 * EXHAUSTIVE BY CONSTRUCTION. The switch returns on every member of the union,
 * so adding a seventh state is a type error here rather than a seventh
 * workspace being told its week was quiet.
 */
export function weeklySubject(company: string, check: WeekCheck): string {
  const head = `${company}: your update`
  switch (check.state) {
    case 'flagged': {
      // A flagged check with nothing printable is not "nothing unusual": the
      // check fired and the detail did not survive the read. Say that much.
      if (check.flags.length === 0) return `${head} — something ${inPeriod(check.noun)} is unusual`
      const flag = check.flags[0]
      // THE OBJECT, AND THE COUNT IT RESTS ON (weekly.headline, block D wave 2).
      // The mock's subject is "Zip failures 3× usual this week, under Freitag
      // content": a multiple with no denominator, read before any of the
      // apparatus that makes a number mean something, and a "where" clause no
      // field supplies. A k OF n is the opposite case — it carries its own
      // denominator, which is the whole of what rule (b) asks — so the subject
      // may state it, and a reader can weigh the claim from the inbox.
      const level = flag.weekN > 0 ? ` — ${fmtInt(flag.weekK)} of ${fmtInt(flag.weekN)} videos` : ''
      return check.flags.length === 1
        ? `${company}: ${flag.label} is unusual ${inPeriod(check.noun)}${level}`
        : `${company}: ${flag.label} and ${fmtInt(check.flags.length - 1)} more are unusual ${inPeriod(check.noun)}${level}`
    }
    case 'nothing_unusual':
      return `${head} — nothing unusual ${inPeriod(check.noun)}`
    case 'baseline_forming':
      // THE NOUN, HERE TOO. Sealand's window is thirty days and its subject
      // read "the weekly check is still forming"; Össur's read "the weekly
      // check is not recorded yet", which lands on a client as a system fault
      // rather than as a young workspace. These two branches were the last
      // fixed "weekly" in a composer whose every sibling already took the noun.
      return `${head} — ${check.noun === 'week' ? 'the weekly check' : 'this update’s check'} is still forming`
    case 'suppressed':
      return `${head} — ${check.noun === 'week' ? 'this week' : 'this update'} was not compared`
    case 'no_window':
      return `${head} — no window was recorded for it`
    case 'not_recorded':
      return `${head} — ${check.noun === 'week' ? 'the weekly check' : 'this update’s check'} is not recorded yet`
  }
}

/** "24.1% · 65 of 271" — a level and the count it rests on, never one alone. */
export function levelOf(k: number, n: number): string {
  return n > 0 ? `${fmtPct(pctOf(k, n))} · ${fmtInt(k)} of ${fmtInt(n)}` : `${fmtInt(k)} videos`
}
