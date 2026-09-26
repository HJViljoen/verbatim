import { fmtInt } from '../format'
import type { WeekLineConfig } from '../week-line-config'
import type { ComparabilityMode, OurChange } from './comparability'
import type { Verdict } from './verdicts'
import {
  buildWeekLine, fillGain, pooledMix, pooledWeekPoints, WEEK_DEPTH_RATIO_MIN, WEEK_FILL_LATE_MAX, WEEK_LINE_EXCLUDED,
  WEEK_UNCHECKED_MAX, weekAgeCutoff, weekDepthRatios, weekPairOf, type WeekLineBlock, type WeekLineObject, type WeekPairReason,
  type WeekPointRow, type WeekRead,
} from './week-line'
import { addDays, isoWeekOf, msOfInstant } from './weeks'

// The Mon 26 Oct check (market-first decision M; WP3.13 "Agent, check"), and
// its re-run on Mon 2 Nov. PURE: scripts/week-points.ts --check reads the kept
// files, the change log and, where a cut is not in a file, the week's comments
// at that cut, and hands them in. The note is for Heinrich: he answers print
// or wait by Mon 26 Oct, 18:00.
//
// What it states, as WP3.13 lists it:
//   1. the fill: each week of the first pair, its comments first captured
//      through each update it has reached, and the gain between two and three
//      updates old against the 3% line (over it, the age moves to 21 days);
//   2. the six conditions for the first pair (28 Sep against 5 Oct), with the
//      depth ratios and the unchecked and older-video shares;
//   3. the results exactly as they would print: every row's two points, raw
//      and at the fixed depth mix the line would fix (the pair's own pooled
//      mix), and the pair's verdict or its "not read the same way" reasons.

export interface WeekFill {
  week: string
  ageDays: number
  comments: number
}

export interface WeekLineCheckInput {
  now: string
  cfg: WeekLineConfig
  /** Every kept read (both ages), from the capture files. */
  reads: readonly WeekRead[]
  /** Their point rows, per audience. */
  rows: readonly WeekPointRow[]
  changes: readonly OurChange[]
  rivalAudiences: readonly string[]
  /** A week's comments at a cut that no kept read holds (read live). */
  fills?: readonly WeekFill[]
  objects?: readonly WeekLineObject[]
}

export interface WeekLineCheck {
  now: string
  pair: { prevWeek: string; week: string }
  /** Per week of the pair, its comments at each age reached, and each gain. */
  fill: { week: string; cuts: { ageDays: number; cutoff: string; comments: number }[]; gains: { fromAge: number; toAge: number; gain: number | null }[] }[]
  /** The gain between `cfg.ageDays` and a week later for the first week: under
   *  3% passes; null when the later cut has not been reached or read. */
  firstWeekGain: number | null
  fillVerdict: 'passes' | 'fails' | 'not_yet'
  conditions: {
    prev: WeekRead | null
    curr: WeekRead | null
    mode: ComparabilityMode
    reasons: { kind: WeekPairReason; detail: string | null }[]
    depth: { mean: number; median: number } | null
  }
  /** The line as it would print on the pair, at the pair's pooled mix. */
  line: WeekLineBlock
  mix: readonly [number, number, number] | null
}

const r1 = (n: number): number => Math.round(n * 10) / 10
const pct = (n: number): string => `${r1(n * 100)}%`
const shortDay = (day: string): string => {
  const d = new Date(msOfInstant(day))
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
}

/** The first pair: the first week and the next one read (the excluded week skipped). */
export function firstPair(firstWeek: string): { prevWeek: string; week: string } {
  const prevWeek = isoWeekOf(firstWeek)
  let week = addDays(prevWeek, 7)
  while (WEEK_LINE_EXCLUDED.includes(week)) week = addDays(week, 7)
  return { prevWeek, week }
}

/** The cuts a week of the pair has reached by `now`, 14, 21 and 28 days (the
 *  re-check on Mon 2 Nov reads the week of 28 Sep at four updates old). */
export function reachedCuts(week: string, now: string): { ageDays: number; cutoff: string }[] {
  return [14, 21, 28]
    .map((ageDays) => ({ ageDays, cutoff: weekAgeCutoff(week, ageDays) }))
    .filter((c) => msOfInstant(c.cutoff) <= msOfInstant(now))
}

export function weekLineCheck(input: WeekLineCheckInput): WeekLineCheck {
  const { cfg } = input
  const pair = firstPair(cfg.firstWeek)
  const readOf = (week: string, age: number): WeekRead | null =>
    input.reads.filter((r) => isoWeekOf(r.week) === week && r.ageDays === age && r.methodVersion === cfg.methodVersion)
      .sort((a, b) => msOfInstant(a.computedAt) - msOfInstant(b.computedAt))[0] ?? null

  const fill = [pair.prevWeek, pair.week].map((week) => {
    const cuts = reachedCuts(week, input.now).flatMap(({ ageDays, cutoff }) => {
      const kept = readOf(week, ageDays)?.comments
      const live = input.fills?.find((f) => isoWeekOf(f.week) === week && f.ageDays === ageDays)?.comments
      const comments = kept ?? live
      return comments == null ? [] : [{ ageDays, cutoff, comments }]
    })
    const gains = cuts.slice(1).map((c, i) => ({ fromAge: cuts[i].ageDays, toAge: c.ageDays, gain: fillGain(cuts[i].comments, c.comments) }))
    return { week, cuts, gains }
  })
  const firstWeekGain = fill[0].gains.find((g) => g.fromAge === cfg.ageDays && g.toAge === cfg.ageDays + 7)?.gain ?? null
  const fillVerdict = firstWeekGain == null ? 'not_yet' : firstWeekGain < WEEK_FILL_LATE_MAX ? 'passes' : 'fails'

  const prev = readOf(pair.prevWeek, cfg.ageDays)
  const curr = readOf(pair.week, cfg.ageDays)
  const judged = weekPairOf(prev, curr, input.changes)
  const mix = prev && curr ? pooledMix([prev, curr]) : null
  const points = pooledWeekPoints(input.rows.filter((r) => r.methodVersion === cfg.methodVersion), input.rivalAudiences)
  const line = buildWeekLine(
    [prev, curr].filter((r): r is WeekRead => r != null),
    points,
    input.changes,
    { ...cfg, mix },
    { objects: input.objects },
  )
  return {
    now: input.now,
    pair,
    fill,
    firstWeekGain,
    fillVerdict,
    conditions: { prev, curr, mode: judged.mode, reasons: judged.reasons, depth: prev && curr ? weekDepthRatios(prev, curr) : null },
    line,
    mix,
  }
}

const verdictWords = (v: Verdict | null, reasons: readonly WeekPairReason[]): string => {
  if (!v) return reasons.length ? `not read the same way: ${reasons.join(', ')}` : 'no verdict (a subject not yet checked)'
  if (v.state === 'refused') return `not read the same way: ${reasons.join(', ')}`
  const change = v.changePts == null ? '' : ` (${v.changePts > 0 ? '+' : ''}${v.changePts} points, band ${v.bandPts})`
  return `${v.state.replace(/_/g, ' ')}${change}`
}

/** The check note, in markdown, for `status/week-line-check-<date>.md`. */
export function weekLineCheckNote(c: WeekLineCheck, opts: { project: string; client: string; latestUpdate: string | null }): string {
  const { prevWeek, week } = c.pair
  const L: string[] = []
  L.push(`# The same-age weekly line: check at ${c.now.slice(0, 10)}`)
  L.push('')
  L.push(`Read-only, on ${opts.project}, client ${opts.client}${opts.latestUpdate ? `, as at the ${shortDay(opts.latestUpdate)} update` : ''}. The first pair is the week of ${shortDay(prevWeek)} against the week of ${shortDay(week)}.`)
  L.push('')
  L.push(`## 1. The fill (under ${pct(WEEK_FILL_LATE_MAX)} between two and three updates old)`)
  L.push('')
  for (const f of c.fill) {
    if (f.cuts.length === 0) {
      L.push(`- Week of ${shortDay(f.week)}: no cut reached or read yet.`)
      continue
    }
    const cuts = f.cuts.map((x) => `${fmtInt(x.comments)} at ${x.ageDays} days (before ${x.cutoff.slice(0, 10)})`).join('; ')
    const gains = f.gains.map((g) => `${g.fromAge} to ${g.toAge} days: ${g.gain == null ? 'not measurable' : `+${pct(g.gain)}`}`).join('; ')
    L.push(`- Week of ${shortDay(f.week)}: ${cuts}.${gains ? ` Gain ${gains}.` : ''}`)
  }
  L.push('')
  L.push(c.fillVerdict === 'passes'
    ? `Result: the week of ${shortDay(prevWeek)} gained ${pct(c.firstWeekGain!)} between two and three updates old, under the line. The 14-day age holds.`
    : c.fillVerdict === 'fails'
      ? `Result: the week of ${shortDay(prevWeek)} gained ${pct(c.firstWeekGain!)} between two and three updates old, over the line. The age moves to 21 days and the first comparison to the 1 Nov update.`
      : `Result: not measurable yet (the week of ${shortDay(prevWeek)} has not been read at both ages).`)
  L.push('')
  L.push(`## 2. The six conditions for ${shortDay(prevWeek)} against ${shortDay(week)}`)
  L.push('')
  const { prev, curr } = c.conditions
  const cell = (r: WeekRead | null, f: (r: WeekRead) => string): string => (r ? f(r) : 'not kept')
  L.push(`| | ${shortDay(prevWeek)} | ${shortDay(week)} |`)
  L.push('|---|---|---|')
  L.push(`| kept at ${c.line.ageDays} days | ${cell(prev, (r) => `yes, through ${r.readThroughRun}`)} | ${cell(curr, (r) => `yes, through ${r.readThroughRun}`)} |`)
  L.push(`| updates in the week, then the two after | ${cell(prev, (r) => `${r.runsInWeek}, ${r.runsAfter.join(', ')}${r.lateRun ? ', one late' : ''}${(r.offCadence ?? 0) > 0 ? `, ${r.offCadence} off cadence` : ''}`)} | ${cell(curr, (r) => `${r.runsInWeek}, ${r.runsAfter.join(', ')}${r.lateRun ? ', one late' : ''}${(r.offCadence ?? 0) > 0 ? `, ${r.offCadence} off cadence` : ''}`)} |`)
  L.push(`| videos, comments | ${cell(prev, (r) => `${fmtInt(r.videos)}, ${r.comments == null ? 'not held' : fmtInt(r.comments)}`)} | ${cell(curr, (r) => `${fmtInt(r.videos)}, ${r.comments == null ? 'not held' : fmtInt(r.comments)}`)} |`)
  L.push(`| mean, median dated comments a video | ${cell(prev, (r) => `${r1(r.meanDated)}, ${r1(r.medianDated)}`)} | ${cell(curr, (r) => `${r1(r.meanDated)}, ${r1(r.medianDated)}`)} |`)
  L.push(`| depth bands 1-4, 5-19, 20+ | ${cell(prev, (r) => r.bands.join(', '))} | ${cell(curr, (r) => r.bands.join(', '))} |`)
  L.push(`| let in unchecked (line ${pct(WEEK_UNCHECKED_MAX)}) | ${cell(prev, (r) => `${r.unchecked} (${pct(r.unchecked / r.videos)})`)} | ${cell(curr, (r) => `${r.unchecked} (${pct(r.unchecked / r.videos)})`)} |`)
  L.push(`| late comments on older videos | ${cell(prev, (r) => `${r.olderVideos} (${pct(r.olderVideos / r.videos)})`)} | ${cell(curr, (r) => `${r.olderVideos} (${pct(r.olderVideos / r.videos)})`)} |`)
  L.push(`| prompt, lane rule | ${cell(prev, (r) => `${r.promptVersion}, ${r.laneRule}`)} | ${cell(curr, (r) => `${r.promptVersion}, ${r.laneRule}`)} |`)
  L.push('')
  if (c.conditions.depth) {
    const d = c.conditions.depth
    L.push(`Depth ratios (smaller over larger; line ${WEEK_DEPTH_RATIO_MIN}): mean ${Number.isFinite(d.mean) ? d.mean.toFixed(2) : 'not measured'}, median ${Number.isFinite(d.median) ? d.median.toFixed(2) : 'not measured'}.`)
    L.push('')
  }
  L.push(c.conditions.mode === 'comparable'
    ? 'Result: read the same way. Every condition holds.'
    : `Result: not read the same way. ${c.conditions.reasons.map((r) => `${r.kind}${r.detail ? ` (${r.detail})` : ''}`).join('; ')}.`)
  L.push('')
  L.push('## 3. As it would print')
  L.push('')
  if (c.mix) L.push(`At the fixed depth mix the line would keep (the pooled mix of the two weeks): ${c.mix.map((m) => m.toFixed(3)).join(', ')}.`, '')
  if (c.line.rows.length === 0) L.push('No row: neither week has kept points yet.')
  for (const row of c.line.rows) {
    const pts = row.points.map((p) => `${shortDay(p.week)} ${fmtInt(p.k)} of ${fmtInt(p.n)} (${pct(p.k / p.n)}${p.standardised != null ? `; at the fixed mix ${pct(p.standardised)}` : ''})`).join(' against ')
    const pr = row.pairs[0]
    L.push(`- ${row.label}${row.calibration && row.calibration !== 'ready' ? ` (${row.calibration})` : ''}: ${pts || 'no point'}. ${pr ? verdictWords(pr.verdict, pr.reasons) : 'no pair'}.`)
  }
  L.push('')
  L.push('## Your answer')
  L.push('')
  L.push('Print or wait, by Mon 26 Oct, 18:00. If print: the deploy 3w word, then the one paste from the run checkout. If wait: the captures continue and the question returns after the Mon 2 Nov re-check.')
  L.push('')
  return L.join('\n')
}
