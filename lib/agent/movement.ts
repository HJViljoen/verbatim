import type { SupabaseClient } from '@supabase/supabase-js'
import { pairSentence } from '../calibration'
import { AGENT_MOVEMENT_MONTHS, AGENT_MOVEMENT_TOPICS } from '../config'
import { monthName } from '../format'
import { audienceLabel } from '../readiness/types'
import { directionWord, monthChange, type Direction, type SeriesPoint } from '../reading/bands'
import { BRANDS_PANEL, comparableOn, type PairOn } from '../reading/pairs'
import { kindChange, kindLabel } from '../reading/kinds'
import { moodChange } from '../reading/mood'
import { pooledDenominators, pooledSide, marketAudiences, type MarketCount } from '../reading/market'
import { SENTIMENT_BAND } from '../report-bands'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import { selectAll } from '../supabase-admin'
import { earnsVerdict, isFailed, type SubjectCalibration } from '../subjects/calibration-state'
import { loadChanges, loadMonthSeries, readingHandle } from '../reading/read'
import { loadAppPairOn } from '../reading/gather-flags'
import { isReadable, pointsByMonth, type MonthLabel, type MonthPoint, type MonthSeries } from '../reading/series'
import { monthStartOf, prevMonth } from '../reading/month-key'
import { sinceStart } from '../reading/horizon'
import { loadMarketRivalAudiences, loadReadingMonth } from '../reading/reading-view'
import { isAnswer, type Verdict, type VerdictFlag } from '../reading/verdicts'
import { monthsWrittenAt, subjectBackRead, subjectCountedFrom, subjectReadIn, unreadWords, type CountedSubject } from '../subjects/read-in'
import { TABLE_SUBJECTS } from '../subjects/types'

// "Has this changed?" — answered from the MONTHLY reading (Phase 1 WP21,
// decision D1 / item 15).
//
// WHAT THIS REPLACES. lib/agent/trend.ts read `theme_observations` — one row
// per theme per RUN, dated by `run_date`, which is the wall clock at persist
// and which one run has carried two of. `movement()` then called a theme
// rising when its evidence count beat the mean of the prior readings by 25%.
// Every part of that is the failure D1 names: a missed week moved the number
// as much as the conversation did, the denominator was never stated, and 2 → 4
// was a doubling.
//
// WHAT IT READS INSTEAD. `month_denominators` and `month_theme_readings`, keyed
// by the month a comment was WRITTEN in, each month carrying its own
// denominator, frozen 30 days after it ends and never rewritten. The
// comparison is `monthChange` — the product's band since 2026-08-18, unpooled
// 2×SE floored at 2 points — and the direction word is `movementDirection`,
// which needs three consecutive months, both floors cleared on each, one
// clustering regime, one audience name and a current month the reading layer
// has not marked thin. This is why `agent.movement` can be true while
// the run-indexed readers stay false: it is a different series, not a
// re-wording of the same one.
//
// WHAT THE MODEL IS ALLOWED TO DO WITH IT. Read the verdicts, and nothing else.
// Every line carries its own answer — moved, no clear change, too few to
// compare, not comparable — and the instruction says the model may not compute
// a direction from the numbers. Code rates, the model explains (design item 9);
// this block is the rating.
//
// WHAT IT DELIBERATELY DOES NOT CARRY. The platform mix per month. It is stored
// on the denominator and the series does not surface it, and a mix quoted
// without its months is exactly the pooling the reading layer refuses — Reddit
// went 6.4% → 17.0% of Össur's category denominator in two months. Saying
// nothing about it is the honest gap; saying something pooled would not be.

/**
 * The direction word this line may carry — the ONE place the block decides it.
 *
 * THE THIN GUARD IS PART OF THE WORD, not a decoration on it. Every other
 * direction-word reader in the product writes `thin ? null : directionWord(…)`
 * (lib/pages/voice-surface.ts, lib/pages/overview.ts twice,
 * lib/pages/subjects.ts); this block called `directionWord` bare, and it is the
 * only reader whose key is on. The failure that allows is three days into a
 * month: one update has landed, the axis still clears both floors on all three
 * months, the steps are monotone and the span clears the band — so the word is
 * `growing`, every other surface prints nothing for that theme, and
 * `renderMovement`'s closing instruction licenses the model to say it. A month
 * is thin when fewer than two updates were delivered into it, or when it
 * carries under 60% of the trailing median video count (THIN_MONTH_UPDATES /
 * THIN_MONTH_SHARE, decision M); `loadMonthSeries` has already run that test
 * per month and attached it as the `thin` label, so the fact is on the point
 * and needs no second read.
 *
 * The VERDICT is not suppressed with it — a banded month-on-month change with
 * both n stated survives a thin month, and says so beside itself through the
 * `thin` flag's own sentence. What a thin month cannot support is a word about
 * three months' travel.
 *
 * AND THE MONTH-PAIR RULE (decision D, WP1.3): the newest of the three months
 * must have ended by `asOf`, and every step between them must be a pair read
 * the same way (`comparable`).
 */
export function movementDirection(
  curr: { labels: readonly MonthLabel[] },
  points: readonly SeriesPoint[],
  rule: { asOf: string; comparable: (prevMonth: string, month: string) => boolean },
): Direction | null {
  return isThin(curr) ? null : directionWord(points, rule)
}

/** Did the reading layer mark this month thin? The label is `thinMonth`'s own
 *  answer (lib/reading/series.ts), taken with the tenant's update counts. */
export const isThin = (point: { labels: readonly MonthLabel[] }): boolean =>
  point.labels.some((l) => l.kind === 'thin')

/** One theme's month-over-month reading, as the block prints it. */
export interface MovementReading {
  /** The theme's current label. Identity is the registry id; this is display. */
  label: string
  /** The audience the share is a share OF, in the client's words. */
  audience: string
  curr: { month: string; k: number | null; n: number | null }
  prev: { month: string; k: number | null; n: number | null }
  verdict: Verdict
  /** Earned over three consecutive readings and withheld where the current
   *  month is thin, or null. Never computed here — `movementDirection`. */
  direction: Direction | null
  /** Months on this axis that carried a readable reading — what "how much
   *  history is behind this" means for one line. */
  readableMonths: number
  /** The current month is still filling: it is re-read by every update until 30
   *  days after it ends, so it is not yet a reading to compare against. */
  filling: boolean
}

const share = (k: number | null, n: number | null): string =>
  n && n > 0 && k != null ? ` (${Math.round((k / n) * 1000) / 10}%)` : ''

const side = (s: { month: string; k: number | null; n: number | null }): string => {
  const when = monthName(s.month)
  if (s.n == null) return `${when} nothing read`
  if (s.k == null) return `${when} ${s.n} videos, this topic not among them`
  return `${when} ${s.k} of ${s.n} videos${share(s.k, s.n)}`
}

/** What the reader (and the model) is told BESIDE the verdict. Each flag is a
 *  fact about our own bookkeeping, not about the conversation, and each gets
 *  its own sentence rather than a code.
 *
 *  FOUR, BECAUSE FOUR IS WHAT CAN ARRIVE. `monthChange` computes
 *  `clustering_changed`, `clustering_unknown` and `renamed`; `thin` is the one
 *  flag this file supplies, off the month's own label. The two that used to sit
 *  here — `re_read` and `measurement_changed` — are produced nowhere this block
 *  reads (`measurement_changed` belongs to `moodChange`, and nothing writes
 *  `re_read` at all), so they were sentences a maintainer could read as a
 *  warning the block already gives. A flag with no note is skipped in
 *  `movementLine`, so the day one of them does arrive it is silent, not a
 *  code.
 *
 *  EXPORTED SO THERE IS ONE COPY (Block D wave 2). Market's ledger prints the
 *  same caveat beside its "Afterwards" verdict — on today's corpus every frozen
 *  month predates the clustering fingerprint, so `clustering_unknown` is on
 *  nearly every comparison there is — and a second table of these sentences is
 *  how a product comes to say two things about one flag. */
export const FLAG_NOTE: Partial<Record<VerdictFlag, string>> = {
  clustering_changed: 'themes were re-grouped between these two months, so the two sides may not be like for like',
  clustering_unknown: 'we did not record how themes were grouped for these months, so the two sides may not be like for like',
  renamed: 'these two months are filed under two names for the same rival',
  thin: 'that month is thin against this audience’s own year',
}

/**
 * The reader's word for each `VerdictState`, in the prompt.
 *
 * ONE VOCABULARY, AND THIS TABLE WAS A FIFTH. `MOVEMENT_WORDS`
 * (components/delta-badge.tsx) is the product's one table for these tokens —
 * its own docstring is about having retired two badges and five movement
 * vocabularies to get there — and this one disagreed with it twice:
 * `baseline_forming` read "not enough history to compare yet" against "not
 * enough months yet", and `refused` read "not comparable" against "comparison
 * refused". That is not academic here: `renderMovement` below tells the model
 * to say these words back, and Ask's answer is client-facing, so a reader could
 * be told in one week that a comparison is "not comparable" by the agent and
 * "comparison refused" by every badge on every other surface. `FLAG_NOTE` six
 * lines above was exported precisely to stop this ("a second table of these
 * sentences is how a product comes to say two things about one flag").
 *
 * REPEATED RATHER THAN IMPORTED, for the reason `lib/reading/gap.ts:GAP_WORDS`
 * already gives about the same two phrases: a lib module may not depend on
 * `components`, and importing a badge to get five words would be the wrong
 * dependency. `lib/agent/movement.test.ts` pins the two tables equal, so the
 * copy stays one copy without the import.
 *
 * `moved` is this table's own: `MOVEMENT_WORDS` excludes it because a MOVED
 * verdict is printed as an arrow and a magnitude rather than a word, and the
 * prompt needs a word.
 */
const STATE_NOTE: Record<string, string> = {
  moved: 'moved',
  no_clear_change: 'no clear change',
  too_little_data: 'too few to compare',
  baseline_forming: 'not enough months yet',
  refused: 'comparison refused',
}

/** One line of the block. Pure, and the only place a verdict becomes words. */
export function movementLine(r: MovementReading): string {
  const v = r.verdict
  const state = STATE_NOTE[v.state] ?? v.state
  const change =
    isAnswer(v.state) && v.changePts != null && v.bandPts != null
      ? `${state} (${v.changePts >= 0 ? '+' : ''}${v.changePts} pts, band ${v.bandPts} pts)`
      : state
  const notes: string[] = []
  if (r.filling) notes.push(`${monthName(r.curr.month)} is still filling and is not yet a settled reading`)
  for (const f of v.flags) {
    const note = FLAG_NOTE[f]
    if (note && !notes.includes(note)) notes.push(note)
  }
  // The month-pair rule's own sentence (decision D, WP1.3): why a comparison
  // was refused, or the note a change of ours left on it. The same words every
  // badge prints, so Ask and the page cannot say two things about one pair.
  if (v.pair) notes.push(pairSentence(v.pair))
  if (v.refusedReason === 'unlogged_era') notes.push('the record does not reach back that far')
  const direction = r.direction
    ? `direction over the last three months: ${r.direction}`
    : 'no direction word has been earned here'
  // ZERO READABLE MONTHS IS NOT "no history" — it is an audience too small to
  // read at all. Össur's own brand carries 20 videos a month against a floor of
  // 100, so every month of it is below the floor while the level is real and
  // printed above. "0 months of readings behind it" said that badly.
  const history =
    r.readableMonths === 0
      ? 'no month here carries enough videos to compare on'
      : `${r.readableMonths} ${r.readableMonths === 1 ? 'month' : 'months'} of readings behind it`
  return [
    `- ${r.label} · ${r.audience}: ${side(r.prev)} → ${side(r.curr)}; ${change}`,
    `    ${direction}; ${history}`,
    ...notes.map((n) => `    · ${n}`),
  ].join('\n')
}

/**
 * The MOVEMENT block, with the direction words on.
 *
 * The header states the unit before the numbers, because the mistake this block
 * exists to stop is a model reading a month as an update.
 */
export function renderMovement(readings: readonly MovementReading[]): string {
  if (readings.length === 0) return NO_MOVEMENT_BLOCK
  return [
    'MOVEMENT OVER TIME (calendar months, each with its own denominator).',
    'A month is dated by when a comment was WRITTEN, not by when we read it. Each',
    'line below carries its own verdict, decided in code against a band.',
    ...readings.map(movementLine),
    'You may name a direction ONLY where a line says growing, fading or flat, and',
    'only in those words. Where a line says "too few to compare", "comparison',
    'refused" or "not enough months yet", say plainly that those months cannot be',
    'compared and answer what the conversation says now.',
    'Never work out a direction from the numbers yourself,',
    'and never describe a month that is still filling as a finished one.',
  ].join('\n')
}

/** What a "has this changed?" question is told when the months hold nothing for
 *  the topics it retrieved. Scoped to A TOPIC's history on purpose: the update's
 *  own banded sentiment and share verdicts survive D1 and the email leads on one
 *  of them, so a blanket "the history is not readable" would have Ask contradict
 *  the email in the same week. */
export const NO_MOVEMENT_BLOCK = [
  'MOVEMENT OVER TIME (calendar months, each with its own denominator).',
  '- no monthly readings for these topics yet',
  'You may NOT claim a topic is growing, fading or steady: say plainly that a topic’s history is not readable yet, and answer what the conversation says now.',
].join('\n')

type Admin = SupabaseClient

export interface MovementArgs {
  clientId: string
  /** `theme_registry.id` per retrieved insight — the ONLY cross-run key
   *  (AGENTS.md), and what `month_theme_readings.theme_id` is. */
  registryIds: string[]
  /** The audience buckets the retrieved insights actually came off. The agent
   *  scopes to the client's own voices, so this is `client` and
   *  `industry-other` — never a rival's, whose months Ask has no question
   *  about. */
  audiences: string[]
  /** Today, injectable so the axis is testable. */
  now?: Date
  /** The month to read, injectable for a test; the reading month (decision A)
   *  when omitted. */
  month?: string
  months?: number
  topics?: number
  /** The month-pair judge (decision D, WP1.3), injectable for a test; read
   *  from the tenant's change log, pair rows and updates when omitted. */
  pair?: PairOn
}

/**
 * Load the movement of the themes one question retrieved.
 *
 * Scoped to those themes on purpose: a client asking about pricing does not
 * need the movement of every theme in the corpus, and handing a model the whole
 * history is how a specific question gets a general answer.
 *
 * Returns `[]` when the monthly reading is not recorded here — which is a real
 * state until M1-M8 are applied, and is why the caller prints NO_MOVEMENT_BLOCK
 * rather than an empty list.
 */
export async function loadMovement(
  admin: Admin,
  args: MovementArgs,
): Promise<MovementReading[]> {
  const registryIds = [...new Set(args.registryIds.filter(Boolean))]
  const audiences = [...new Set(args.audiences.filter(Boolean))]
  if (registryIds.length === 0 || audiences.length === 0) return []

  const now = args.now ?? new Date()
  const months = args.months ?? AGENT_MOVEMENT_MONTHS
  const asOf = now.toISOString()
  // THE READING MONTH, NOT THE CALENDAR'S (decision A; default M-f, as the
  // Record tab's Delivery and Coverage since 91af44f5): on 1 to 15 Oct Ask read
  // October, a day or two of it, where every page reads September. Off the
  // same memoised reads the pages make; the calendar month only where nothing
  // has been delivered or the read failed, as before.
  const handle = readingHandle(args.clientId, admin)
  const reading = args.month
    ? null
    : await loadReadingMonth(admin, handle, asOf).catch((e: unknown) => {
      console.error(`[agent] movement month: ${(e as { message?: string })?.message ?? String(e)}`)
      return null
    })
  const to = monthStartOf(args.month ?? reading?.month ?? asOf)
  const from = monthsBack(to, months - 1)

  const set = await loadMonthSeries(admin, args.clientId, {
    audiences,
    objectKind: 'theme',
    objectIds: registryIds,
    from,
    to,
  })
  // `missing` is the migration not being applied here; `not_seeded` is a
  // workspace nobody has read months for. Both are "no history", and neither is
  // "the topic was never mentioned" — the block says the first thing, never the
  // second.
  if (set.substrate !== 'seeded' || set.numeratorSubstrate !== 'seeded') return []
  // EVERY LINE IS JUDGED BY THE MONTH-PAIR RULE (decision D, WP1.3): a so-far
  // month is never compared, and a pair spanning our own search change is
  // refused, so Ask cannot say "moved" where every page refuses to.
  // It fails closed: a read error refuses every pair and Ask still answers.
  const pair = args.pair ?? (await loadAppPairOn(handle, asOf))

  // THE MONTH TO READ IS THE READING MONTH (decision A, above), filling or
  // not, against the month before it — the lib/pages/voice-surface.ts
  // precedent. A filling month is re-read by every update, so part of its
  // movement is our own reading schedule rather than the conversation's; it is
  // still the month a reader asking today wants, so it is PRINTED WITH ITS OWN
  // NOTE — "September 2026 is still filling and is not yet a settled reading",
  // the first line of `movementLine`'s notes — rather than held back. Today
  // that means every Össur line compares a half-finished September (388
  // videos) against August (628), and says so beside the verdict.
  //
  // An earlier version of this comment opened by claiming the last COMPLETE
  // month is read wherever the current one is still filling. No such guard
  // exists here or below, and the next reader should not go looking for one.
  const readings: MovementReading[] = []
  for (const s of set.series) {
    if (!s.objectId) continue
    const byMonth = pointsByMonth(s)
    const curr = byMonth.get(to)
    if (!curr) continue
    const prevKey = prevMonth(to)
    const prev: MonthPoint | undefined = byMonth.get(prevKey)
    const label = s.objectLabel ?? s.objectId
    // The month's own thinness, read once: it stops the direction word below
    // and it is told to the reader beside the verdict.
    const thin = isThin(curr)
    const verdict = monthChange({
      object: { kind: 'theme', id: s.objectId, label },
      audience: s.audience,
      ...(thin ? { flags: ['thin' as VerdictFlag] } : {}),
      curr,
      // A month with no row on the other side is not skipped: monthChange
      // answers `too_little_data`, which is the honest verdict for a theme's
      // first month (the voice-surface precedent).
      prev: prev ?? { month: prevKey, videos: null, k: null, audience: s.audience },
      comparability: pair(prevKey, to, s.audience),
    })
    readings.push({
      label,
      audience: audienceLabel(s.audience),
      curr: { month: curr.month, k: curr.k, n: curr.videos },
      prev: { month: prevKey, k: prev?.k ?? null, n: prev?.videos ?? null },
      verdict,
      direction: movementDirection(curr, s.points, { asOf, comparable: comparableOn(pair, s.audience) }),
      readableMonths: s.points.filter(isReadable).length,
      filling: curr.state === 'filling',
    })
  }

  return rankMovement(readings, args.topics ?? AGENT_MOVEMENT_TOPICS)
}

/**
 * Which lines make the block, when a question retrieves more themes than a
 * prompt should carry.
 *
 * An ANSWERED verdict first — moved, then no clear change — because a line that
 * says something is worth more to the answer than a line that declines to, and
 * a prompt truncated by chance would drop the one reading the question was
 * about. Ties by the object's own size this month, so a theme nobody mentioned
 * does not push out one they did. Pure and exported so the rule is arguable.
 */
export function rankMovement(readings: readonly MovementReading[], limit: number): MovementReading[] {
  const rank = (r: MovementReading): number => {
    if (r.verdict.state === 'moved') return 0
    if (r.verdict.state === 'no_clear_change') return 1
    if (r.verdict.state === 'refused') return 3
    return 2
  }
  return [...readings]
    .sort((a, b) => rank(a) - rank(b) || (b.curr.k ?? 0) - (a.curr.k ?? 0) || a.label.localeCompare(b.label))
    .slice(0, limit)
}

/** `n` months before `month`, as a month start. */
function monthsBack(month: string, n: number): string {
  let m = monthStartOf(month)
  for (let i = 0; i < n; i++) m = prevMonth(m)
  return m
}

// ── Beyond themes: subjects, kinds, mood and brand topics (WP3.9) ────────────
//
// THE MARKET, NOT THE CLIENT AND THE CATEGORY. A theme is grouped per audience
// and its figure stays the category's (decision E). A subject, a kind, the
// mood and a brand topic are read on the MARKET: the category pooled with the
// videos filed under a brand the client tracks, month by month, the client's
// own posts left out (`pooledDenominators`, `pooledSide`, lib/reading/market.ts)
// — the figure the front page and Subjects print for the same object, so
// "Ask about this" on a subject lands on the subject's own number (S7).
//
// THE SAME RULES AS EVERY OTHER READER.
//  · Each pair is judged by the month-pair rule (decision D): the pooled market
//    is the `market` view, a brand topic the `brands` view. A refused pair
//    prints its refusal and never "moved".
//  · A direction word comes from `directionWord` alone, over three comparable
//    ended months (`comparableOn`), and never on a thin month.
//  · Decision C: a provisional subject prints its market level with no verdict
//    and no direction word; a failed one prints nothing but "being
//    re-described".
//  · A brand topic is read off `month_brand_readings` (MF3). Before that table
//    exists every brand line says "not read yet": the name was asked about,
//    and nothing counted it.

/** What a question can name besides a theme. */
export type MarketObjectKind = 'subject' | 'kind' | 'mood' | 'brand'

export interface MarketObjectRef {
  kind: MarketObjectKind
  /** The subject's id, the kind's enum value, the mood's (`positive`), or the
   *  brand's `month_brand_readings.brand_key` (a competitor's id). */
  id: string
  label: string
  /** A subject's state (decision C). */
  calibration?: SubjectCalibration | null
}

/** One month of one object on the market: k of n, never a zero for a month
 *  nobody read. */
export interface MarketPoint {
  month: string
  k: number | null
  n: number | null
}

/** One object's reading, as the prompt and the thread page both take it. */
export interface ObjectReading {
  object: MarketObjectRef
  /** `read`: the object has rows; `not_read`: its table is not there yet, or
   *  nothing was recorded for it; `unread`: a subject the month was not read
   *  for (named after the month's rows were written), which prints `unread`'s
   *  words where Subjects prints them, never "0 of N". */
  state: 'read' | 'not_read' | 'unread'
  /** A subject the month was not read for: "no reading yet" while the updates
   *  to come still read the month, else "not read in {Month}" (`unreadWords`,
   *  the Subjects rail's and pane's own wording). Null otherwise. */
  unread?: string | null
  /** The months on the axis up to the month read, oldest first. */
  trail: MarketPoint[]
  curr: MarketPoint | null
  prev: MarketPoint | null
  /** Null where no comparison is owed: a provisional or failed subject, or an
   *  object that was not read. */
  verdict: Verdict | null
  direction: Direction | null
  /** The month read is still filling. */
  filling: boolean
}

/** The key a brand topic's month pair is judged under: the brands view. */
export const BRAND_PAIR_KEY = BRANDS_PANEL

/** The key the pooled market is judged under: the market view. */
export const MARKET_PAIR_KEY = 'market'

/** What a question names, for the reading below. The client's words, never
 *  the model's (lib/agent/scope.ts). */
export interface ObjectPoints {
  object: MarketObjectRef
  /** One point per axis month; a month with no row at all is null k and n. */
  points: MarketPoint[]
  /** Months the reading layer marked thin (under two updates, or under 60% of
   *  the trailing median), which carry no direction word. */
  thin?: ReadonlySet<string>
  /** Months whose row status is still filling. */
  filling?: ReadonlySet<string>
  /** Nothing recorded for this object at all. */
  notRead?: boolean
  /** The next scheduled update, while the month read is the reading month:
   *  what decides "no reading yet" against "not read in {Month}" for a
   *  subject the month was not read for. */
  nextUpdate?: string | null
}

const pointFor = (points: readonly MarketPoint[], month: string): MarketPoint | undefined =>
  points.find((p) => monthStartOf(p.month) === month)

/**
 * One object's reading of `month` against the month before it. Pure.
 *
 * `asOf` is the instant the reading is taken: the newest month of a direction
 * word must have ended by it (`directionWord`'s own rule).
 */
export function objectReading(
  input: ObjectPoints,
  month: string,
  pair: PairOn,
  asOf: string,
): ObjectReading {
  const m = monthStartOf(month)
  const prevKey = prevMonth(m)
  const trail = input.points.filter((p) => monthStartOf(p.month) <= m)
  const curr = pointFor(trail, m) ?? null
  const prev = pointFor(trail, prevKey) ?? null
  const filling = input.filling?.has(m) ?? false
  const o = input.object
  const empty: ObjectReading = { object: o, state: 'not_read', trail, curr, prev, verdict: null, direction: null, filling }
  if (input.notRead || !curr || curr.n == null) return empty
  // DECISION C. A failed subject is being re-described and prints nothing; a
  // provisional one prints its level and earns no verdict and no word.
  if (o.kind === 'subject' && isFailed(o.calibration)) return { ...empty, state: 'read', curr: null, prev: null, trail: [] }
  // A SUBJECT THE MONTH WAS NOT READ FOR (WP1.1 review, finding 1): its k is
  // no reading, never 0, and it says so in Subjects' own words.
  if (o.kind === 'subject' && curr.k == null) {
    return { ...empty, state: 'unread', unread: unreadWords({ month: m, filling, nextUpdate: input.nextUpdate ?? null }) }
  }
  const base: ObjectReading = { object: o, state: 'read', trail, curr, prev, verdict: null, direction: null, filling }
  if (o.kind === 'subject' && !earnsVerdict(o.calibration)) return base

  const key = o.kind === 'brand' ? BRAND_PAIR_KEY : MARKET_PAIR_KEY
  const comparability = pair(prevKey, m, key)
  const thin = input.thin?.has(m) ?? false
  const flags = thin ? (['thin'] as VerdictFlag[]) : []
  const at = (p: MarketPoint | null, when: string) => ({ month: when, videos: p?.n ?? null, k: p?.k ?? null, audience: MARKET_PAIR_KEY })

  let verdict: Verdict
  if (o.kind === 'kind') {
    verdict = kindChange({ kind: o.id, audience: MARKET_PAIR_KEY, curr: at(curr, m), prev: at(prev, prevKey), flags, comparability })
  } else if (o.kind === 'mood') {
    // Decision K: the mood is compared on its positive share. `n` is the
    // judged videos, `k` the positive ones (`moodChange`'s own reading).
    const counts = (p: MarketPoint | null) => ({ judged: p?.n ?? 0, positive: p?.k ?? 0, negative: 0, neutral: 0, mixed: 0 })
    verdict = moodChange({ audience: MARKET_PAIR_KEY, mood: 'positive', curr: { month: m, ...counts(curr) }, prev: { month: prevKey, ...counts(prev) }, flags, comparability })
  } else {
    verdict = monthChange({
      object: { kind: o.kind === 'brand' ? 'rival' : 'subject', id: o.id, label: o.label },
      audience: MARKET_PAIR_KEY,
      ...(flags.length ? { flags } : {}),
      curr: { ...at(curr, m), regime: 'n/a' } as SeriesPoint,
      prev: { ...at(prev, prevKey), regime: 'n/a' } as SeriesPoint,
      comparability,
    })
  }
  const series: SeriesPoint[] = trail.map((p) => ({ month: monthStartOf(p.month), videos: p.n, k: p.k, audience: MARKET_PAIR_KEY, regime: 'n/a' }))
  const direction = thin ? null : directionWord(series, { asOf, comparable: comparableOn(pair, key), ...(o.kind === 'mood' ? { floor: SENTIMENT_BAND } : {}) })
  verdict.direction = direction
  return { ...base, verdict, direction }
}

/** What each object is, in the reader's words, in a line of the prompt. */
function objectNoun(o: MarketObjectRef): string {
  if (o.kind === 'subject') return `${o.label} (a subject${o.calibration === 'provisional' ? ', provisional' : ''})`
  if (o.kind === 'kind') return `${kindLabel(o.id)} (what people were doing)`
  if (o.kind === 'mood') return 'The mood, positive of the videos judged'
  return `${o.label} (a brand, named in the video or its comments)`
}

const MARKET_WORDS = 'your market'

/** One object's lines in the prompt. The figures are CODE's, stated for the
 *  model to read and never to retype (the answer's digits are scrubbed). */
export function objectLine(r: ObjectReading): string {
  const head = `- ${objectNoun(r.object)} · ${MARKET_WORDS}`
  if (r.state === 'not_read') return `${head}: not read yet`
  if (r.object.kind === 'subject' && isFailed(r.object.calibration)) return `${head}: being re-described, so no figure is given`
  if (r.state === 'unread') return `${head}: ${r.unread ?? 'no reading yet'}, because it was named after the month's videos were read, so no figure is given`
  // Only the months read: a month with no reading is left out, never "0 of N".
  const trail = r.trail
    .filter((p) => p.n != null && p.k != null)
    .map((p) => `${monthName(p.month)} ${p.k} of ${p.n} videos${share(p.k, p.n)}`)
    .join(' · ')
  const lines = [`${head}: ${trail || 'nothing read'}`]
  const v = r.verdict
  if (v) {
    const state = STATE_NOTE[v.state] ?? v.state
    lines.push(`    ${isAnswer(v.state) && v.changePts != null && v.bandPts != null ? `${state} (${v.changePts >= 0 ? '+' : ''}${v.changePts} pts, band ${v.bandPts} pts)` : state} against the month before`)
    lines.push(`    ${r.direction ? `direction over the last three months: ${r.direction}` : 'no direction word has been earned here'}`)
    if (v.pair) lines.push(`    · ${pairSentence(v.pair)}`)
  } else {
    lines.push('    a level only: not compared with the month before, because this subject is still being checked')
  }
  if (r.filling && r.curr) lines.push(`    · ${monthName(r.curr.month)} is still filling and is not yet a settled reading`)
  return lines.join('\n')
}

/**
 * The block every question that NAMES something carries, whatever its
 * timeframe: the named objects' own figures and trail, so an answer about
 * Waterproofing is an answer about Waterproofing's own number.
 */
export function renderObjects(readings: readonly ObjectReading[]): string {
  if (readings.length === 0) return ''
  return [
    'WHAT THE QUESTION NAMES, READ ON YOUR MARKET (calendar months, each with its own denominator; the client’s own posts are not in it).',
    ...readings.map(objectLine),
    'These are the readings of the things the question names. Answer about them from these lines, name the month,',
    'and never type a figure yourself: the page prints them. Name a direction only where a line says growing, fading or flat.',
  ].join('\n')
}

/** Is this error "the table is not there yet"? Narrow by name, the
 *  `isMissing*` precedent: any other failure of the read is not an absent
 *  migration. */
export function isMissingRelation(error: unknown, table: string): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!text.includes(table)) return false
  if (code && ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(code)) return true
  return /does not exist/i.test(text) || /in the schema cache/i.test(text)
}

/** `month_brand_readings` (MF3, plan §4.2). */
export const TABLE_BRAND_READINGS = 'month_brand_readings'

export interface ObjectReadArgs {
  clientId: string
  objects: readonly MarketObjectRef[]
  /** The month read, `YYYY-MM-01`. */
  month: string
  months?: number
  pair: PairOn
  asOf: string
  /** The tracked rivals' audience keys; read when omitted. */
  rivalAudiences?: readonly string[] | null
  /** The next scheduled update, when `month` is the reading month (the
   *  frame's `reading.nextUpdate`): a subject the month was not read for says
   *  "no reading yet" while one is coming. */
  nextUpdate?: string | null
}

type Row = Record<string, unknown>

type RangeRead = { range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }> }

async function readRows(
  admin: Admin,
  table: string,
  columns: string,
  clientId: string,
  from: string,
  to: string,
  only?: { column: string; values: readonly string[] },
): Promise<Row[] | null> {
  try {
    return await selectAll<Row>(() => {
      let q = admin.from(table).select(columns).eq('client_id', clientId).gte('month', from).lte('month', to)
      if (only) q = q.in(only.column, [...only.values])
      return q.order('month', { ascending: true }).order('audience', { ascending: true }) as unknown as RangeRead
    })
  } catch (error) {
    if (isMissingRelation(error, table)) return null
    throw error
  }
}

/**
 * The named objects' readings, on the market, for one month.
 *
 * AT MOST FIVE READS, each over the axis and each only when a named object
 * needs it: the denominators (one read, memoised per request by the reading
 * layer), the subjects' months, the kinds', the mood's, and the brand topics'.
 * A table that is not there answers "not read yet" for its objects and the
 * rest still read. Any other failure throws, and the caller answers without
 * the block rather than with a wrong one.
 */
export async function loadObjectReadings(admin: Admin, args: ObjectReadArgs): Promise<ObjectReading[]> {
  if (args.objects.length === 0) return []
  const month = monthStartOf(args.month)
  const from = monthsBack(month, (args.months ?? AGENT_MOVEMENT_MONTHS) - 1)
  const rivals = args.rivalAudiences ?? (await loadMarketRivalAudiences(admin, args.clientId)) ?? []
  const audiences = marketAudiences(rivals)

  const denoms = await loadMonthSeries(admin, args.clientId, { audiences, from, to: month })
  if (denoms.substrate !== 'seeded') return args.objects.map((o) => objectReading({ object: o, points: [], notRead: true }, month, args.pair, args.asOf))
  // THE AXIS STARTS WHERE THE PAGES' CHARTS START (`chartMonths` from
  // `sinceStart`, decision M): the first month any market audience cleared
  // the floor. Before it the months hold too little to read, and Subjects
  // draws none of them: Sealand's trail is "Aug 10% of 377 · Sep 16% of 654",
  // never July's 4 of 36 before it.
  const axis = axisFromStart(monthAxisOf(from, month), denoms.denominators, audiences)
  const counts = pooledDenominators(denoms.denominators, rivals)
  const thin = new Set<string>()
  const filling = new Set<string>()
  for (const s of denoms.series) {
    if (s.audience !== INDUSTRY_AUDIENCE) continue
    for (const p of s.points) {
      if (p.labels.some((l) => l.kind === 'thin')) thin.add(monthStartOf(p.month))
      if (p.state === 'filling') filling.add(monthStartOf(p.month))
    }
  }
  const pooled = (rows: readonly { month: string; audience: string; k: number | null }[], read: boolean): MarketPoint[] =>
    axis.map((m) => {
      const side = pooledSide(rows, counts, m, rivals, { read: read && counts.has(m) })
      return { month: m, k: side.k, n: side.n }
    })

  const subjects = args.objects.filter((o) => o.kind === 'subject')
  const kinds = args.objects.filter((o) => o.kind === 'kind')
  const brands = args.objects.filter((o) => o.kind === 'brand')
  const mood = args.objects.find((o) => o.kind === 'mood') ?? null

  const [subjectSet, kindRows, moodRows, brandRows, subjectClock] = await Promise.all([
    subjects.length
      ? loadMonthSeries(admin, args.clientId, { audiences, objectKind: 'subject', objectIds: subjects.map((s) => s.id), from, to: month })
      : Promise.resolve(null),
    kinds.length
      ? readRows(admin, 'month_kind_readings', 'month, audience, kind, videos', args.clientId, from, month, { column: 'kind', values: kinds.map((k) => k.id) })
      : Promise.resolve(null),
    mood ? readRows(admin, 'month_audience_stats', 'month, audience, judged, positive', args.clientId, from, month) : Promise.resolve(null),
    brands.length
      ? readRows(admin, TABLE_BRAND_READINGS, 'month, audience, brand_key, k_any, n', args.clientId, from, month, { column: 'brand_key', values: brands.map((b) => b.id) })
      : Promise.resolve(null),
    subjects.length ? loadSubjectClock(admin, args.clientId, subjects.map((s) => s.id)) : Promise.resolve(null),
  ])
  const writtenAt = monthsWrittenAt(denoms.denominators, new Set(audiences))

  const out: ObjectReading[] = []
  for (const o of args.objects) {
    let input: ObjectPoints
    if (o.kind === 'subject') {
      const seeded = subjectSet != null && subjectSet.numeratorSubstrate === 'seeded'
      const lines = seeded ? subjectSet.series.filter((s) => s.objectId === o.id) : []
      input = {
        object: o,
        points: subjectPoints(lines, axis, counts, rivals, { seeded, countedFrom: subjectClock?.get(o.id) ?? null, writtenAt }),
        thin,
        filling,
        notRead: !seeded,
        nextUpdate: args.nextUpdate ?? null,
      }
    } else if (o.kind === 'kind') {
      const rows = (kindRows ?? []).filter((r) => r.kind === o.id).map((r) => ({ month: monthStartOf(String(r.month)), audience: String(r.audience), k: Number(r.videos) }))
      input = { object: o, points: pooled(rows, kindRows != null), thin, filling, notRead: kindRows == null }
    } else if (o.kind === 'mood') {
      // n is the market's JUDGED videos, pooled; k its positive ones.
      const byMonth = new Map<string, { judged: number; positive: number }>()
      const markets = new Set(audiences)
      for (const r of moodRows ?? []) {
        if (!markets.has(String(r.audience))) continue
        const m = monthStartOf(String(r.month))
        const c = byMonth.get(m) ?? { judged: 0, positive: 0 }
        c.judged += Number(r.judged) || 0
        c.positive += Number(r.positive) || 0
        byMonth.set(m, c)
      }
      input = { object: o, points: axis.map((m) => ({ month: m, k: byMonth.get(m)?.positive ?? null, n: byMonth.get(m)?.judged ?? null })), thin, filling, notRead: moodRows == null }
    } else {
      // A brand topic: the videos in the market naming the brand. A row per
      // market audience pools like a subject's; a pooled row of its own
      // (an audience that is not an audience key) is taken as it is.
      const mine = (brandRows ?? []).filter((r) => r.brand_key === o.id)
      const perAudience = mine.filter((r) => audiences.includes(String(r.audience)))
      const pooledRows = mine.filter((r) => !audiences.includes(String(r.audience)) && String(r.audience) !== CLIENT_AUDIENCE)
      const points: MarketPoint[] = perAudience.length > 0 || pooledRows.length === 0
        ? pooled(perAudience.map((r) => ({ month: monthStartOf(String(r.month)), audience: String(r.audience), k: Number(r.k_any) })), brandRows != null)
        : axis.map((m) => {
          const r = pooledRows.find((x) => monthStartOf(String(x.month)) === m)
          return { month: m, k: r ? Number(r.k_any) : null, n: r ? Number(r.n) : null }
        })
      input = { object: o, points, thin, filling, notRead: brandRows == null || mine.length === 0 }
    }
    out.push(objectReading(input, month, args.pair, args.asOf))
  }
  return out
}

/**
 * A subject's months on the market, as Subjects prints them (S7: "Ask about
 * this" lands on the subject's own figure and trail). Pure.
 *
 * TWO RULES, BOTH SUBJECTS' OWN (`marketLineOf`, lib/pages/subjects.ts):
 *  · a market audience with no denominator row in a month holds no videos
 *    that month and is left out of its sum. The month series carries a point
 *    for it all the same, with no k and no videos, and `pooledSide` reads a
 *    row with no k as "this side is unknown": every subject read "null of
 *    654" on staging's September (the named rivals with no September videos),
 *    and the block printed "0 of 654";
 *  · a month the subject was not read in (named after the month's rows were
 *    written, `subjectReadIn`) is no reading, never the 0 the month series
 *    fills in.
 */
export function subjectPoints(
  lines: readonly MonthSeries[],
  axis: readonly string[],
  counts: ReadonlyMap<string, MarketCount>,
  rivalAudiences: readonly string[],
  clock: { seeded: boolean; countedFrom: number | null; writtenAt: ReadonlyMap<string, number> },
): MarketPoint[] {
  const cited = new Set<string>()
  for (const l of lines) for (const p of l.points) if ((p.k ?? 0) > 0) cited.add(monthStartOf(p.month))
  const backRead = subjectBackRead(clock.countedFrom, cited, clock.writtenAt)
  const byAudience = lines.map((l) => ({ audience: l.audience, points: pointsByMonth(l) }))
  return axis.map((m) => {
    const rows = byAudience
      .map((l) => ({ audience: l.audience, point: l.points.get(m) ?? null }))
      .filter((r) => r.point != null && r.point.videos != null)
      .map((r) => ({ month: m, audience: r.audience, k: r.point!.k }))
    const read = clock.seeded && counts.has(m) && subjectReadIn({ countedFrom: clock.countedFrom, writtenAt: clock.writtenAt.get(m), cited: cited.has(m), backRead }) === 'read'
    const side = pooledSide(rows, counts, m, rivalAudiences, { read })
    return { month: m, k: read ? side.k : null, n: side.n }
  })
}

/**
 * When each named subject started being counted (`subjectCountedFrom`): its
 * row's `named_at` and `created_at` and its confirmation in the change log
 * (memoised, already read by the month series). One small read, only when a
 * question names a subject.
 */
async function loadSubjectClock(admin: Admin, clientId: string, ids: readonly string[]): Promise<Map<string, number | null>> {
  const [res, changes] = await Promise.all([
    admin.from(TABLE_SUBJECTS).select('id, named_at, created_at').eq('client_id', clientId).in('id', [...ids]),
    loadChanges(admin, clientId),
  ])
  if (res.error) throw new Error(`subjects clock: ${res.error.message}`)
  const out = new Map<string, number | null>()
  for (const row of (res.data ?? []) as CountedSubject[]) out.set(row.id, subjectCountedFrom(row, changes))
  return out
}

/** The axis from the first month a market audience cleared the floor
 *  (`sinceStart`), and never empty: the month read stays. Pure. */
export function axisFromStart(
  axis: readonly string[],
  denominators: readonly { month: string; audience: string; videos: number | null }[],
  audiences: readonly string[],
): string[] {
  const market = new Set(audiences)
  const start = sinceStart(denominators.filter((d) => market.has(d.audience)).map((d) => ({ month: d.month, videos: d.videos ?? 0 }))).from
  if (!start) return [...axis]
  const trimmed = axis.filter((m) => m >= monthStartOf(start))
  return trimmed.length > 0 ? trimmed : axis.slice(-1)
}

/** Every month from `from` to `to` inclusive, as month starts. */
function monthAxisOf(from: string, to: string): string[] {
  const out: string[] = []
  let m = monthStartOf(from)
  const last = monthStartOf(to)
  while (m <= last && out.length < 60) {
    out.push(m)
    m = nextMonthOf(m)
  }
  return out
}

function nextMonthOf(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}
