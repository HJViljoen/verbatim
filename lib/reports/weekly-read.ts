import { fmtInt, longMonth } from '../format'
import type { Verdict } from '../reading/verdicts'
import { coveredDays, inMonth, monthHeading } from '../written/month'
import type { FigureTable } from './types'
import type { StoredWeekRead } from '../written/store'
import type { QuoteRef, WeekMarketFigures, WeekReadData, WeekReadFlag } from '../written/types'
import type { WeeklyReadLine } from './weekly-read-lines'

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

const monthOf = (day: string) => longMonth(`${day.slice(0, 7)}-01`)
const dayOf = (day: string) => Number(day.slice(8, 10))

/**
 * "28 September to 4 October": the comment dates the read covers, named as
 * the reader counts them (`coveredDays`, lib/written/month.ts). A comment is
 * dated by its date alone, so the Sunday window [Sun 27 Sep 04:03, Sun 4 Oct
 * 04:02) holds 28 September to 4 October: a comment dated 27 September sits at
 * 00:00, before the window opens. A thirty-day window is named as thirty days
 * and a mid-week manual run as the days it covers; nothing here assumes a week.
 */
export function weekReadDates(window: { from: string; to: string } | null | undefined): string {
  const c = coveredDays(window)
  if (!c) return ''
  const [first, last] = [c.first, c.last]
  if (c.days === 1) return `${dayOf(last)} ${monthOf(last)}`
  if (first.slice(0, 7) === last.slice(0, 7)) return `${dayOf(first)} to ${dayOf(last)} ${monthOf(last)}`
  if (first.slice(0, 4) === last.slice(0, 4)) return `${dayOf(first)} ${monthOf(first)} to ${dayOf(last)} ${monthOf(last)}`
  return `${dayOf(first)} ${monthOf(first)} ${first.slice(0, 4)} to ${dayOf(last)} ${monthOf(last)} ${last.slice(0, 4)}`
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
  /** The heading over the month's two numbers: "September so far" while the
   *  month is under way, "September in total" for a week that carried past
   *  its end (lib/written/month.ts). */
  monthHeading: string
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
      findings, market: null, monthHeading: monthHeading(read.month, false), figures, month: read.month,
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
    monthHeading: monthHeading(read.month, read.monthComplete),
    figures,
    month: read.month,
  }
}

// ---- Level 1 (depth v2, T11b; board E7) ------------------------------------------------
//
// The email a new snapshot (version 2) sends: the week in one line, the
// market's week beside its month, the lead (the flag the update's check
// raised, else the week's biggest new conversation), what else came up, one
// line per page, the way in. No quote at level 1 (Heinrich's v2 rule): the
// quotes stay in the full read and on the pages. Decision 1 throughout: no
// weekly direction word, and every week figure beside its month (a flag's
// week beside the months the check compared it with).

/** The most rows "Also this week" prints. */
export const ALSO_ROWS = 3

/** Where an object opens: a conversation or a subject in Market's open
 *  panel, anything else Market itself. An app path. */
export function objectHref(kind: string, id: string): string {
  const market = '/dashboard/market'
  if (kind === 'theme' && id) return `${market}?conv=${encodeURIComponent(id)}`
  if (kind === 'subject' && id) return `${market}?subject=${encodeURIComponent(id)}`
  return market
}

/** A flag's months, pooled, as one month's worth: "about 13 of 363 a
 *  month", the k and n the check compared the week with, over the months it
 *  pooled. Null without months. */
export function usualMonth(flag: Pick<WeekReadFlag, 'baseline' | 'baselineMonths'>): { k: number; n: number } | null {
  const m = flag.baselineMonths.length
  if (m === 0 || flag.baseline.n <= 0) return null
  return { k: Math.round(flag.baseline.k / m), n: Math.round(flag.baseline.n / m) }
}

/** "19 of 241 videos this week · usually about 6 of 363 a month". */
export function flagFigure(flag: Pick<WeekReadFlag, 'week' | 'baseline' | 'baselineMonths'>): string {
  const usual = usualMonth(flag)
  const week = `${fmtInt(flag.week.k)} of ${fmtInt(flag.week.n)} videos this week`
  return usual ? `${week} · usually about ${fmtInt(usual.k)} of ${fmtInt(usual.n)} a month` : week
}

export type LevelOneLead =
  | { kind: 'flag'; flag: WeekReadFlag; usual: { k: number; n: number } | null; href: string }
  | { kind: 'new'; themeId: string; label: string | null; body: string; videos: { week: number; month: number }; evidence: string; href: string }

export interface LevelOneRow {
  kind: 'flag' | 'new' | 'heard'
  /** The conversation's or the object's name. */
  label: string
  /** A theme's label is Pass B's words (`subject`, `pass_b_theme`); a kind,
   *  a subject or a rival is named by code or the client. */
  theme: boolean
  /** The flag's verdict, for its chip. */
  verdict: Verdict | null
  /** Code's figure: the week beside its month, or beside its months. */
  figure: string
  href: string
}

export interface LevelOneView {
  /** The week in one line (the writer's, scrubbed), or ''. */
  headline: string
  /** The market's week beside its month. Null where either is not read. */
  numbers: {
    week: { videos: number; comments: number | null }
    month: { videos: number; comments: number | null }
    /** "in September so far", "in September". */
    where: string
  } | null
  lead: LevelOneLead | null
  also: LevelOneRow[]
  lines: WeeklyReadLine[]
  figures: FigureTable
  month: string
  /** "in September so far", "in September": what a week is restated against. */
  where: string
}

/** The level-1 email from a version-2 snapshot. Pure. */
export function levelOneView(read: WeekReadData, lines: readonly WeeklyReadLine[] = []): LevelOneView {
  const figures = read.figures ?? {}
  const v2 = read.version === 2 ? read : null
  const where = inMonth(read.month, v2?.monthComplete)
  const weekMonth = (w: number, m: number) => `${fmtInt(w)} ${w === 1 ? 'video' : 'videos'} this week · ${fmtInt(m)} ${where}`

  const market = v2?.market ?? null
  const numbers = market && market.week.videos != null && market.month.videos != null
    ? {
        week: { videos: market.week.videos, comments: market.week.comments != null && market.month.comments != null ? market.week.comments : null },
        month: { videos: market.month.videos, comments: market.week.comments != null && market.month.comments != null ? market.month.comments : null },
        where,
      }
    : null

  // THE LEAD: the update's first flag (the check's own rank order,
  // `weekFlagRows`), else the week's biggest new conversation, else none.
  const flags = (v2?.unusual?.flags ?? []).filter((f) => f.label.trim() && f.verdict?.state === 'moved')
  const fresh = [...(v2?.newThisWeek ?? [])]
    .filter((x) => (x.body ?? '').trim())
    .sort((a, b) => b.videos.week - a.videos.week || a.themeId.localeCompare(b.themeId))
  let lead: LevelOneLead | null = null
  if (flags[0]) lead = { kind: 'flag', flag: flags[0], usual: usualMonth(flags[0]), href: objectHref(flags[0].objectKind, flags[0].objectId) }
  else if (fresh[0]) {
    const x = fresh[0]
    lead = { kind: 'new', themeId: x.themeId, label: x.label?.trim() || null, body: x.body.trim(), videos: x.videos, evidence: (x.evidence ?? '').trim(), href: objectHref('theme', x.themeId) }
  }

  // ALSO THIS WEEK: the other flags, then the other new conversations, then
  // what else was heard most; each object once, at most ALSO_ROWS.
  const shown = new Set<string>()
  if (lead?.kind === 'flag' && lead.flag.objectKind === 'theme') shown.add(lead.flag.objectId)
  if (lead?.kind === 'new') shown.add(lead.themeId)
  const also: LevelOneRow[] = []
  const push = (row: LevelOneRow, themeId: string | null) => {
    if (also.length >= ALSO_ROWS || (themeId && shown.has(themeId))) return
    if (themeId) shown.add(themeId)
    also.push(row)
  }
  for (const f of flags.slice(1)) {
    push({ kind: 'flag', label: f.label.trim(), theme: f.objectKind === 'theme', verdict: f.verdict, figure: flagFigure(f), href: objectHref(f.objectKind, f.objectId) }, f.objectKind === 'theme' ? f.objectId : null)
  }
  for (const x of fresh) {
    if (!x.label?.trim()) continue
    push({ kind: 'new', label: x.label.trim(), theme: true, verdict: null, figure: weekMonth(x.videos.week, x.videos.month), href: objectHref('theme', x.themeId) }, x.themeId)
  }
  const heard = [...(read.alsoHeard ?? [])]
    .filter((h) => h.label.trim() && typeof h.monthVideos === 'number' && h.videos > 0)
    .sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label))
  for (const h of heard) {
    push({ kind: 'heard', label: h.label.trim(), theme: true, verdict: null, figure: weekMonth(h.videos, h.monthVideos as number), href: objectHref('theme', h.themeId) }, h.themeId)
  }

  const first = (read.findings ?? []).find((f) => (f.headline ?? '').trim())
  const headline = weekReadLine(read) || (first ? `${first.headline.trim().replace(/[.!?]+$/, '')}.` : '')
  return { headline, numbers, lead, also, lines: [...lines], figures, month: read.month, where }
}
