import { marketConversationPath, marketSubjectPath } from '../nav'
import { voicesBrandPath } from '../pages/v2/voices-address'
import { fmtInt, longMonth } from '../format'
import type { Verdict } from '../reading/verdicts'
import { coveredDays, inMonth, monthHeading, monthsPhrase } from '../written/month'
import { weekLead } from '../reading/week-lead'
import { rivalNameOf } from '../rivals'
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
  empty: 'The written read for this update has nothing to print (no line, no story, no implication and no finding), so nothing was sent.',
}

/** Does a stored read hold anything the issue prints? Version 3 (18 Oct)
 *  prints the week in one line, what happened and what it means, and no
 *  finding, so a read with any of those prints; an older read (In short and
 *  findings) needs its In short or a finding. */
export function weekReadPrints(read: WeekReadData): boolean {
  const findings = Array.isArray(read.findings) && read.findings.some((f) => (f?.headline ?? '').trim())
  if (read.version !== 2) return findings || Boolean((read.inShort ?? '').trim())
  return findings
    || Boolean((read.headline ?? '').trim())
    || (read.story ?? []).some((p) => (p?.body ?? '').trim())
    || (read.implications ?? []).some((x) => (x?.body ?? '').trim())
}

/**
 * THE SEND RULE (plan T7): a run whose read is not `ready` sends NOTHING,
 * never an empty report. Missing (the step did not run, or its table is not
 * there), failed, thin, or "ready" with nothing the issue prints in it (which
 * compose never writes; checked anyway, because the email would be a
 * masthead and four numbers): each is a reason, and the caller skips the
 * send and tells the operator. Since version 3 a finding is not required:
 * the issue prints none (`weekReadPrints`).
 */
export function weekReadSendState(row: Pick<StoredWeekRead, 'status' | 'data'> | null): WeekReadSendState {
  const held = (reason: WeekReadHeldReason): WeekReadSendState => ({ ok: false, reason, message: WEEK_READ_HELD_MESSAGE[reason] })
  if (!row) return held('missing')
  if (row.status === 'failed') return held('failed')
  if (row.status === 'thin') return held('thin')
  if (row.status !== 'ready' || !row.data) return held('missing')
  if (!weekReadPrints(row.data)) return held('empty')
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

/** Where an object opens: a conversation's or a subject's page on Market
 *  (17 Oct; a snapshot built before then carries the old `?conv=` /
 *  `?subject=`, which redirect there), a rival its brand page on Voices (17
 *  Oct, by name, which the page resolves; an older `?brand=` redirects
 *  there), anything else Market itself. An app path. */
export function objectHref(kind: string, id: string): string {
  const market = '/dashboard/market'
  if (kind === 'theme' && id) return marketConversationPath(id)
  if (kind === 'subject' && id) return marketSubjectPath(id)
  if (kind === 'rival' && id) return voicesBrandPath(rivalNameOf(id) ?? id)
  return market
}

/**
 * What the check compared a flag's week with, said as it is: the plain total
 * over the months it pooled ("usually 38 of 1,089 over June, July and
 * August"). Not a month's average: a small baseline divided by its months
 * rounds to "0 of 363", which is not what anyone saw. Null without months.
 */
export function usualOver(flag: Pick<WeekReadFlag, 'baseline' | 'baselineMonths'>): { k: number; n: number; months: string } | null {
  if (flag.baselineMonths.length === 0 || flag.baseline.n <= 0) return null
  return { k: flag.baseline.k, n: flag.baseline.n, months: monthsPhrase(flag.baselineMonths) }
}

/** "19 of 241 videos this week · usually 38 of 1,089 over June, July and August". */
export function flagFigure(flag: Pick<WeekReadFlag, 'week' | 'baseline' | 'baselineMonths'>): string {
  const usual = usualOver(flag)
  const week = `${fmtInt(flag.week.k)} of ${fmtInt(flag.week.n)} videos this week`
  return usual ? `${week} · usually ${fmtInt(usual.k)} of ${fmtInt(usual.n)} over ${usual.months}` : week
}

/** "Most talked about this week": the lead when nothing was flagged or new. */
export const BIGGEST_HEADING = 'Most talked about this week'

export type LevelOneLead =
  | { kind: 'flag'; flag: WeekReadFlag; usual: { k: number; n: number; months: string } | null; href: string }
  /** A conversation first heard this week (`body`, the writer's sentence on
   *  it), or the week's biggest: its count this week beside its month. The
   *  label is Pass B's (`theme`), or, on a read stored before its
   *  conversations were kept, the headline of the finding that rests on it
   *  alone (`finding`, the writer's). */
  | { kind: 'new' | 'biggest'; themeId: string; label: string | null; labelKind: 'theme' | 'finding'; body: string | null; videos: { week: number; month: number | null }; href: string }

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
  /** ADDITIVE (version 3): the counts behind `figure`, for a renderer that
   *  sets each number in its own node: a conversation's week and month, or
   *  the flag itself and what the check compared it with. */
  counts?: { week: number; month: number | null }
  flag?: WeekReadFlag
  usual?: { k: number; n: number; months: string } | null
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

/** A conversation of the week, as the lead's rule reads it, with its month
 *  and where its label came from. */
interface LeadConversationRow { registryId: string; label: string; labelKind: 'theme' | 'finding'; week: number; month: number | null; setApart: boolean }

/**
 * The week's conversations: the read's own list where it kept one
 * (`conversations`: the category's window and month counts, Market's set-apart
 * mark; the counts the lead ranks on). A read stored before T11b has none, and
 * gives what it holds instead, ranked on its own lenient-gated counts: the
 * conversations also heard, and each finding that rests on one conversation
 * alone (named by its headline).
 */
function leadConversations(read: WeekReadData): { rows: LeadConversationRow[]; kept: boolean } {
  const kept = read.version === 2 ? read.conversations : undefined
  if (kept) return { kept: true, rows: kept.filter((c) => c.label.trim()).map((c) => ({ ...c, label: c.label.trim(), labelKind: 'theme' as const })) }
  return {
    kept: false,
    rows: [
      ...(read.alsoHeard ?? [])
        .filter((h) => h.label.trim() && typeof h.monthVideos === 'number')
        .map((h) => ({ registryId: h.themeId, label: h.label.trim(), labelKind: 'theme' as const, week: h.videos, month: h.monthVideos as number, setApart: false })),
      ...(read.findings ?? [])
        .filter((f) => f.basedOn.length === 1 && (f.headline ?? '').trim() && f.videos)
        .map((f) => ({ registryId: f.basedOn[0], label: f.headline.trim(), labelKind: 'finding' as const, week: f.videos.week, month: f.videos.month, setApart: false })),
    ],
  }
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

  // THE LEAD (lib/reading/week-lead.ts, the one rule, Market's too): the
  // update's first flag, else the conversation first heard this week with the
  // most videos this week, else the conversation with the most; both ranked on
  // the category's window count, a set-apart one never. A check that could not
  // be read gives no flag.
  const unusual = v2?.unusual
  const flags = unusual?.unread ? [] : (unusual?.flags ?? []).filter((f) => f.label.trim() && f.verdict?.state === 'moved')
  const fresh = (v2?.newThisWeek ?? []).filter((x) => (x.body ?? '').trim())
  const freshById = new Map(fresh.map((x) => [x.themeId, x]))
  const convs = leadConversations(read)
  const picked = weekLead({ flags, newThisWeek: fresh.map((x) => ({ registryId: x.themeId })), conversations: convs.rows })
  let lead: LevelOneLead | null = null
  if (picked?.kind === 'flag') {
    const f = picked.flag
    lead = { kind: 'flag', flag: f, usual: usualOver(f), href: objectHref(f.objectKind, f.objectId) }
  } else if (picked) {
    const c = picked.conversation
    const x = picked.kind === 'new' ? freshById.get(c.registryId) ?? null : null
    lead = {
      kind: picked.kind,
      themeId: c.registryId,
      label: c.label,
      labelKind: c.labelKind,
      body: x ? x.body.trim() : null,
      videos: { week: c.week, month: c.month },
      href: objectHref('theme', c.registryId),
    }
  }
  const leadFlag = lead?.kind === 'flag' ? lead.flag : null
  const rest = flags.filter((f) => f !== leadFlag)

  // ALSO THIS WEEK: the other flags, then the other new conversations, then
  // what else was heard most; each object once, at most ALSO_ROWS.
  const shown = new Set<string>()
  if (lead?.kind === 'flag' && lead.flag.objectKind === 'theme') shown.add(lead.flag.objectId)
  if (lead?.kind === 'new' || lead?.kind === 'biggest') shown.add(lead.themeId)
  const also: LevelOneRow[] = []
  const push = (row: LevelOneRow, themeId: string | null) => {
    if (also.length >= ALSO_ROWS || (themeId && shown.has(themeId))) return
    if (themeId) shown.add(themeId)
    also.push(row)
  }
  for (const f of rest) {
    push({ kind: 'flag', label: f.label.trim(), theme: f.objectKind === 'theme', verdict: f.verdict, figure: flagFigure(f), href: objectHref(f.objectKind, f.objectId), flag: f, usual: usualOver(f) }, f.objectKind === 'theme' ? f.objectId : null)
  }
  // The other new conversations, then what else was heard most: on the
  // conversations' own counts where the read kept them (the lead's), a
  // set-apart one never; on an older read, its own.
  if (convs.kept) {
    const ranked = convs.rows.filter((c) => !c.setApart && c.week > 0 && c.month != null).sort((a, b) => b.week - a.week || a.registryId.localeCompare(b.registryId))
    for (const c of ranked.filter((c) => freshById.has(c.registryId))) {
      push({ kind: 'new', label: c.label, theme: true, verdict: null, figure: weekMonth(c.week, c.month as number), href: objectHref('theme', c.registryId), counts: { week: c.week, month: c.month } }, c.registryId)
    }
    for (const c of ranked) {
      push({ kind: 'heard', label: c.label, theme: true, verdict: null, figure: weekMonth(c.week, c.month as number), href: objectHref('theme', c.registryId), counts: { week: c.week, month: c.month } }, c.registryId)
    }
  } else {
    const freshRows = [...fresh].sort((a, b) => b.videos.week - a.videos.week || a.themeId.localeCompare(b.themeId))
    for (const x of freshRows) {
      if (!x.label?.trim()) continue
      push({ kind: 'new', label: x.label.trim(), theme: true, verdict: null, figure: weekMonth(x.videos.week, x.videos.month), href: objectHref('theme', x.themeId), counts: { week: x.videos.week, month: x.videos.month } }, x.themeId)
    }
    const heard = [...(read.alsoHeard ?? [])]
      .filter((h) => h.label.trim() && typeof h.monthVideos === 'number' && h.videos > 0)
      .sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label))
    for (const h of heard) {
      push({ kind: 'heard', label: h.label.trim(), theme: true, verdict: null, figure: weekMonth(h.videos, h.monthVideos as number), href: objectHref('theme', h.themeId), counts: { week: h.videos, month: h.monthVideos as number } }, h.themeId)
    }
  }

  const first = (read.findings ?? []).find((f) => (f.headline ?? '').trim())
  const headline = weekReadLine(read) || (first ? `${first.headline.trim().replace(/[.!?]+$/, '')}.` : '')
  return { headline, numbers, lead, also, lines: [...lines], figures, month: read.month, where }
}
