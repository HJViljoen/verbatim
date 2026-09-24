import type { SupabaseClient } from '@supabase/supabase-js'
import { AGENT_MOVEMENT_MONTHS, AGENT_MOVEMENT_TOPICS } from '../config'
import { monthName } from '../format'
import { audienceLabel } from '../readiness/types'
import { directionWord, monthChange, type Direction, type SeriesPoint } from '../reading/bands'
import { loadMonthSeries } from '../reading/read'
import { isReadable, pointsByMonth, type MonthLabel, type MonthPoint } from '../reading/series'
import { monthStartOf, prevMonth } from '../reading/month-key'
import { isAnswer, type Verdict, type VerdictFlag } from '../reading/verdicts'

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
 */
export function movementDirection(
  curr: { labels: readonly MonthLabel[] },
  points: readonly SeriesPoint[],
): Direction | null {
  return isThin(curr) ? null : directionWord(points)
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
  months?: number
  topics?: number
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
  const to = monthStartOf(now.toISOString())
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

  // THE MONTH TO READ IS THE CURRENT CALENDAR MONTH, filling or not, against
  // the month before it — the lib/pages/voice-surface.ts precedent. A filling
  // month is re-read by every update, so part of its movement is our own
  // reading schedule rather than the conversation's; it is still the month a
  // reader asking today wants, so it is PRINTED WITH ITS OWN NOTE — "September
  // 2026 is still filling and is not yet a settled reading", the first line of
  // `movementLine`'s notes — rather than held back. Today that means every
  // Össur line compares a half-finished September (388 videos) against August
  // (628), and says so beside the verdict.
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
    })
    readings.push({
      label,
      audience: audienceLabel(s.audience),
      curr: { month: curr.month, k: curr.k, n: curr.videos },
      prev: { month: prevKey, k: prev?.k ?? null, n: prev?.videos ?? null },
      verdict,
      direction: movementDirection(curr, s.points),
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
