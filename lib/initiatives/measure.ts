import type { InitiativeDirection } from './types'

// Measuring a declared initiative (WP7c) — pure, so it is tested and so the
// same numbers reach the page, the export and the email.
//
// What is measured: the SHARE of the update's themed conversation that the
// initiative's themes account for, one point per calendar day, from the day it
// was declared. Share and not the raw count, because a count rises whenever an
// update gathers more video — "your theme grew" would then mostly mean "we
// scraped harder this week". The denominator is every theme observation that
// update, so the question the number answers is the one the client asked: is
// this a bigger part of the conversation than it was?
//
// What is NOT measured: whether the initiative worked. Nothing here knows
// whether the client's campaign caused anything, and the copy never implies it
// (GLOSSARY `initiative`). `direction` only decides whether a movement reads
// as the way they wanted; it never changes a number.

/** Under this many share points either way, the conversation has not moved.
 *  Theme share on a real tenant wobbles by a few tenths between updates with
 *  nothing happening at all; a band below that would report noise as news. */
export const INITIATIVE_FLAT_BAND = 1.0

/** The least that can say anything: a line needs two ends. */
export const INITIATIVE_MIN_POINTS = 2

/** One `theme_observations` row, as the loader hands it over. */
export interface ObservationPoint {
  runId: string
  /** Calendar day of the update (`run_date`). */
  runDate: string
  /** Tiebreaker when two updates land on one day. */
  createdAt: string
  evidenceCount: number
  /** `dominant_sentiment_impact`: positive | neutral | negative. */
  sentiment: string | null
}

export interface InitiativePoint {
  date: string
  /** Percent of that update's themed conversation, 0–100, one decimal. */
  share: number
  /** −1 … +1, evidence-weighted; null when nothing was rated. */
  sentiment: number | null
  /** Conversations behind it that update — the count, never hidden. */
  evidence: number
}

export type InitiativeVerdict = 'moving_up' | 'moving_down' | 'flat' | 'too_early'

export interface InitiativeMeasure {
  points: InitiativePoint[]
  startShare: number | null
  latestShare: number | null
  /** latest − start, in share points. Null until there are two points. */
  delta: number | null
  /** Sentiment at the latest point minus the first, −2 … +2. */
  sentimentDelta: number | null
  verdict: InitiativeVerdict
}

const round1 = (n: number) => Math.round(n * 10) / 10
const day = (s: string) => s.slice(0, 10)

/**
 * Collapse a set of observations into the initiative's line.
 *
 * `rows` are the observations of THIS initiative's themes only (any number of
 * themes — they are summed, because the initiative is the subject, not each
 * theme). `totalByRun` is every theme observation's evidence in that same
 * update, the denominator. `startedAt` is the day the client declared it:
 * anything earlier is not this initiative's, however tempting a longer line is.
 *
 * Two updates on one calendar day collapse to the later one (the `latestPerDay`
 * rule the charts already follow) — two points printing the same date is a
 * chart that lies about its x-axis.
 */
export function measureInitiative(
  rows: ObservationPoint[],
  totalByRun: Record<string, number>,
  startedAt: string,
): InitiativeMeasure {
  const from = day(startedAt)

  // Fold the initiative's themes together, one entry per update.
  const byRun = new Map<string, { date: string; createdAt: string; evidence: number; pos: number; neg: number; rated: number }>()
  for (const r of rows) {
    const date = day(r.runDate)
    if (!date || date < from) continue
    const e = byRun.get(r.runId) ?? { date, createdAt: r.createdAt, evidence: 0, pos: 0, neg: 0, rated: 0 }
    e.evidence += Math.max(0, r.evidenceCount)
    if (r.sentiment === 'positive') { e.pos += Math.max(0, r.evidenceCount); e.rated += Math.max(0, r.evidenceCount) }
    else if (r.sentiment === 'negative') { e.neg += Math.max(0, r.evidenceCount); e.rated += Math.max(0, r.evidenceCount) }
    else if (r.sentiment === 'neutral') { e.rated += Math.max(0, r.evidenceCount) }
    if (r.createdAt > e.createdAt) e.createdAt = r.createdAt
    byRun.set(r.runId, e)
  }

  // One point per calendar day: the later update of a doubled-up day wins.
  const perDay = new Map<string, { runId: string; createdAt: string }>()
  for (const [runId, e] of byRun) {
    const held = perDay.get(e.date)
    if (!held || e.createdAt > held.createdAt) perDay.set(e.date, { runId, createdAt: e.createdAt })
  }

  const points: InitiativePoint[] = [...perDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, { runId }]) => {
      const e = byRun.get(runId)!
      const total = totalByRun[runId] ?? 0
      return {
        date,
        share: total > 0 ? round1((e.evidence / total) * 100) : 0,
        sentiment: e.rated > 0 ? round1((e.pos - e.neg) / e.rated) : null,
        evidence: e.evidence,
      }
    })

  const first = points[0] ?? null
  const last = points[points.length - 1] ?? null
  const startShare = first ? first.share : null
  const latestShare = last ? last.share : null

  if (points.length < INITIATIVE_MIN_POINTS) {
    return { points, startShare, latestShare, delta: null, sentimentDelta: null, verdict: 'too_early' }
  }

  const delta = round1(last!.share - first!.share)
  const sentimentDelta =
    first!.sentiment != null && last!.sentiment != null ? round1(last!.sentiment - first!.sentiment) : null
  const verdict: InitiativeVerdict =
    Math.abs(delta) < INITIATIVE_FLAT_BAND ? 'flat' : delta > 0 ? 'moving_up' : 'moving_down'

  return { points, startShare, latestShare, delta, sentimentDelta, verdict }
}

/**
 * The verdict in the client's words. `startedLabel` is a formatted date
 * ("12 Aug") — this module does no formatting of its own.
 *
 * Calibrated: it reports the conversation, never the initiative. "Up 2.3
 * points" is a fact about share; "working" would be a claim about cause, and
 * nothing here measures cause.
 */
export function initiativeLine(m: InitiativeMeasure, startedLabel: string): string {
  const updates = m.points.length
  if (m.verdict === 'too_early') {
    return updates === 0
      ? `Nothing heard on this since ${startedLabel} — it lands with the next update.`
      : `One update in since ${startedLabel} — movement needs a second.`
  }
  const size = Math.abs(m.delta ?? 0).toFixed(1)
  if (m.verdict === 'flat') return `Holding steady since ${startedLabel} · ${updates} updates`
  return `${m.verdict === 'moving_up' ? 'Up' : 'Down'} ${size} points since ${startedLabel} · ${updates} updates`
}

/** Whether a movement went the way the client said they wanted. Null when
 *  there is nothing to judge — never a green tick on a flat line. */
export function wentTheirWay(m: InitiativeMeasure, direction: InitiativeDirection): boolean | null {
  if (m.verdict === 'too_early' || m.verdict === 'flat') return null
  return direction === 'up' ? m.verdict === 'moving_up' : m.verdict === 'moving_down'
}
