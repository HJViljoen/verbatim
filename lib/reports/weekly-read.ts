import { longMonth } from '../format'
import type { FigureTable } from './types'
import type { StoredWeekRead } from '../written/store'
import type { QuoteRef, WeekMarketFigures, WeekReadData } from '../written/types'

// The weekly read as a report (plan "Verbatim, writing back", T6/T7 as
// re-decided on 30 Sep: ONE general weekly for everyone, no department lines).
// The artefact `weekly_read` is the email of one stored `week_reads` row; this
// file is its pure half: the dates, the subject, whether a stored read may be
// sent at all, and the report's sections in the order the approved design
// (Weekly-v3) prints them. No I/O and no React: the snapshot is
// lib/reports/weekly-read-build.ts, the renderers components/email/weekly-read.tsx.

/** The report's name, on every surface that prints it. */
export const WEEKLY_READ_TITLE = 'This week in your market'

/** The longest one-line subject: past it, the code-built subject is used, so
 *  nothing in an inbox is cut mid-claim. */
export const WEEKLY_READ_SUBJECT_MAX = 140

const DAY_MS = 86_400_000

function utcDay(ms: number): { y: number; m: number; d: number } {
  const t = new Date(ms)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

const monthOf = (x: { y: number; m: number }) => longMonth(`${x.y}-${String(x.m).padStart(2, '0')}-01`)

/**
 * "21 to 27 September": the days the read covers, named as the reader counts
 * them. The window is the run's frozen, half-open `[from, to)`, and on the
 * Sunday cadence it is seven days ending on the morning of the run, so it is
 * named as the seven calendar days ending on the run's day (UTC, as every
 * date in the product is printed): the window's length in whole days, ending
 * on the day of its last instant. A thirty-day window is named as thirty days
 * and a mid-week manual run as the days it covers; nothing here assumes a week.
 */
export function weekReadDates(window: { from: string; to: string } | null | undefined): string {
  if (!window) return ''
  const from = Date.parse(window.from)
  const to = Date.parse(window.to)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return ''
  const days = Math.max(1, Math.round((to - from) / DAY_MS))
  const lastMs = to - 1
  const last = utcDay(lastMs)
  const lastStart = Date.UTC(last.y, last.m - 1, last.d)
  const first = utcDay(lastStart - (days - 1) * DAY_MS)
  if (days === 1) return `${last.d} ${monthOf(last)}`
  if (first.y === last.y && first.m === last.m) return `${first.d} to ${last.d} ${monthOf(last)}`
  if (first.y === last.y) return `${first.d} ${monthOf(first)} to ${last.d} ${monthOf(last)}`
  return `${first.d} ${monthOf(first)} ${first.y} to ${last.d} ${monthOf(last)} ${last.y}`
}

/** The week in one line as the read stores it: v3's headline; an older read
 *  has none (its In short is a paragraph, not a line). */
export function weekReadLine(read: WeekReadData): string {
  return read.version === 2 ? (read.headline ?? '').replace(/\s+/g, ' ').trim() : ''
}

/**
 * "Sealand: {the week in one line}". The line is the writer's, scrubbed at
 * write time (no digit, no direction word, no process talk); it is checked
 * again here for a digit, because a subject line is the one place a stored
 * sentence is printed without its node's copy contract. A line that is
 * missing, carries a digit or would be cut in an inbox gives the code-built
 * subject instead: "Sealand: this week in your market, 21 to 27 September",
 * whose only digits are code's dates.
 */
export function weeklyReadSubject(company: string, read: WeekReadData, dates: string): string {
  const who = company.trim()
  const line = weekReadLine(read).replace(/[.!?\s]+$/, '')
  if (line && !/\d/.test(line) && line.length <= WEEKLY_READ_SUBJECT_MAX) {
    return who ? `${who}: ${line}` : line
  }
  const fallback = `this week in your market${dates ? `, ${dates}` : ''}`
  return who ? `${who}: ${fallback}` : `${fallback.charAt(0).toUpperCase()}${fallback.slice(1)}`
}

// ---- May this read be sent? ------------------------------------------------------------

/** Why a run's read is not sent. Operator words: these reach the send row's
 *  `error` (the Studio's history, the operator's alert), never a client. */
export type WeekReadHeldReason = 'missing' | 'failed' | 'thin' | 'empty'

export type WeekReadSendState = { ok: true } | { ok: false; reason: WeekReadHeldReason; message: string }

export const WEEK_READ_HELD_MESSAGE: Record<WeekReadHeldReason, string> = {
  missing: 'No written read was stored for this update, so nothing was sent.',
  failed: 'The written read for this update failed, so nothing was sent.',
  thin: 'The written read for this update was thin (no finding printed), so nothing was sent.',
  empty: 'The written read for this update has no finding to print, so nothing was sent.',
}

/**
 * THE SEND RULE (plan T7): a run whose read is not `ready` sends NOTHING,
 * never an empty report. Missing (the step did not run, or its table is not
 * there), failed, thin, or "ready" with no finding in it (which compose never
 * writes; checked anyway, because the email would be a masthead and four
 * numbers): each is a reason, and the caller skips the send and tells the
 * operator.
 */
export function weekReadSendState(row: Pick<StoredWeekRead, 'status' | 'data'> | null): WeekReadSendState {
  const held = (reason: WeekReadHeldReason): WeekReadSendState => ({ ok: false, reason, message: WEEK_READ_HELD_MESSAGE[reason] })
  if (!row) return held('missing')
  if (row.status === 'failed') return held('failed')
  if (row.status === 'thin') return held('thin')
  if (row.status !== 'ready' || !row.data) return held('missing')
  if (!Array.isArray(row.data.findings) || row.data.findings.length === 0) return held('empty')
  return { ok: true }
}

// ---- The report's sections -------------------------------------------------------------

/** A quote as a renderer gets it: the stored ref, its words resolved at render
 *  (`text`), and the translation the resolver may add. */
export type ResolvedQuote = Omit<QuoteRef, 'text'> & { text: string; lang?: string | null; english?: string | null }

export interface WeeklyReadView {
  /** The serif lead and what it is called: "The week in one line" (v3), or an
   *  older read's In short paragraph. */
  lead: { label: string; body: string } | null
  story: { body: string; quote: ResolvedQuote | null }[]
  implications: string[]
  watch: string[]
  newThisWeek: { body: string; evidence: string }[]
  /** The email prints them compact (the headline, the short line, which is
   *  what it means, and the evidence line); the web page in full (what was
   *  seen and the finding's quote as well). */
  findings: { headline: string; line: string; evidence: string; saw: string; quote: ResolvedQuote | null }[]
  market: WeekMarketFigures | null
  /** The read's printed figures: every `[[key]]` above resolves here. */
  figures: FigureTable
  month: string
}

/** A line that ends a thought ends with a stop: a watch line is stored as a
 *  bare clause ("Whether colour requests keep naming exact shades"). */
function closed(s: string): string {
  const t = s.trim()
  return !t || /[.!?…"”)]$/.test(t) ? t : `${t}.`
}

/** The first sentence of a paragraph, for a finding stored without its
 *  "what it means" line. */
function firstSentence(s: string): string {
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(s.trim())
  return (m ? m[0] : s).trim()
}

/** A quote that came back with its words, or null (a withdrawn comment is
 *  nulled by the resolver, and a frozen one has no words to print). */
export function resolvedQuote(q: QuoteRef | null | undefined): ResolvedQuote | null {
  if (!q || typeof q !== 'object') return null
  const raw = (q as { text?: unknown }).text
  const text = typeof raw === 'string' ? raw.trim() : ''
  return text ? ({ ...(q as Omit<ResolvedQuote, 'text'>), text }) : null
}

/**
 * The report top to bottom, from a stored read of either version, in the
 * design's order: the four numbers, the week in one line, what happened (with
 * its quotes), what it means for the company, worth watching next week, new
 * this week (only where something was first heard this week), and the week's
 * findings, compact. Every section is empty where the read has nothing for it,
 * and a renderer prints no section that is empty (§0a.2: no empty sections, no
 * placeholders). An older read (v1, v2 of the writer) has no report sections:
 * its In short leads and its findings follow.
 */
export function weeklyReadView(read: WeekReadData): WeeklyReadView {
  const findings = (read.findings ?? [])
    .map((f) => ({
      headline: (f.headline ?? '').trim(),
      line: (f.means ?? '').trim() || firstSentence(f.saw ?? ''),
      evidence: (f.evidence ?? '').trim()
        || (f.videos ? `${f.videos.week} videos this week · ${f.videos.month} in ${longMonth(read.month)} so far` : ''),
      saw: (f.saw ?? '').trim(),
      quote: resolvedQuote(f.quote),
    }))
    .filter((f) => f.headline)
  const figures = read.figures ?? {}
  if (read.version !== 2) {
    const inShort = (read.inShort ?? '').trim()
    return {
      lead: inShort ? { label: 'In short', body: inShort } : null,
      story: [], implications: [], watch: [], newThisWeek: [],
      findings, market: null, figures, month: read.month,
    }
  }
  const line = weekReadLine(read)
  return {
    lead: line ? { label: 'The week in one line', body: line } : null,
    story: (read.story ?? []).map((p) => ({ body: (p.body ?? '').trim(), quote: resolvedQuote(p.quote) })).filter((p) => p.body),
    implications: (read.implications ?? []).map((x) => (x.body ?? '').trim()).filter(Boolean),
    watch: (read.watch ?? []).map((x) => closed(x.body ?? '')).filter(Boolean),
    newThisWeek: (read.newThisWeek ?? []).map((x) => ({ body: (x.body ?? '').trim(), evidence: (x.evidence ?? '').trim() })).filter((x) => x.body),
    findings,
    market: read.market ?? null,
    figures,
    month: read.month,
  }
}
