import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk } from '../chunk'
import { selectAll } from '../supabase-admin'
import {
  FREEZE_AFTER_DAYS,
  RPC_DENOMINATORS,
  RPC_THEME_READINGS,
  TABLE_DENOMINATORS,
  TABLE_THEME_READINGS,
  type DenominatorReading,
  type DenominatorRow,
  type FreezeColumns,
  type MonthOrigin,
  type MonthStatus,
  type StoredFreeze,
  type ThemeReading,
  type ThemeReadingRow,
} from './types'

// The comment-dated monthly reading: when a month stops moving, and what gets
// written down (Phase 0, design items 1–2, decision D7).
//
// THE RULE, IN ONE PARAGRAPH. A calendar month is `filling` until 30 days after
// it ends: every run re-reads it from the current clustering and overwrites the
// row. The first run after that line writes the final values and marks the row
// `frozen`, and no run ever writes a frozen row again. A month first written
// after its line had already passed is `back_read` and frozen at once — it is a
// reading of today's corpus, not the reading anyone was given at the time.
//
// WHY 30 DAYS, AND WHAT IT DOES NOT BUY. Measured on Össur, a comment posted on
// a video already in the corpus reaches the database within 14 days in 90% of
// cases and 30 days in 96.6%. That is the only one of the four forces on a
// month with a time constant. A video DISCOVERED later drops its entire
// back-thread in at once, and 976 Össur comments arrived more than a year after
// they were written — so no waiting period makes a month final, and a frozen
// row can still be contradicted by a fresh reading. It does not move: the
// design's rule is that no artefact is silently corrected, so the accrual shows
// up as the gap between the record and a new reading, never as a number that
// changed behind someone's back.
//
// WHY WRITE IT DOWN AT ALL. The other two forces destroy the evidence rather
// than add to it. The Pass A prune hard-deletes superseded insights and their
// citations cascade away (18.2% of all stored member references in production
// already point at rows that no longer exist), and the retention sweep deletes
// comments outright — it is live, and has already taken a comment a shipped
// report cited. History can be recomputed FORWARD from today's corpus; it can
// never be backfilled to what an earlier run reported. Whatever is not written
// down at the time is gone.
//
// Dates are UTC throughout. `comments.comment_date` is a timestamptz whose
// values are all UTC midnight (four normalisers go through toDateOnly), and the
// SQL functions bucket in UTC explicitly, so a month here is a UTC month and
// never the server's local one.

// ---- Months -----------------------------------------------------------------

const DAY_MS = 86_400_000

const pad = (n: number): string => String(n).padStart(2, '0')

/** The first day of the month an instant falls in, `YYYY-MM-DD`, UTC. */
export function monthStartOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error(`monthStartOf: not a date: ${iso}`)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
}

/** The month after this one. */
export function nextMonth(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  return monthStartOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString())
}

/** The instant a month ends — i.e. the first instant of the next month, which
 *  is the exclusive upper bound of its half-open window. */
export function monthEndInstant(month: string): string {
  return `${nextMonth(month)}T00:00:00.000Z`
}

/** The half-open window `[from, to)` a month covers, as the two SQL functions
 *  take it. */
export function monthWindow(month: string): { from: string; to: string } {
  return { from: `${monthStartOf(month)}T00:00:00.000Z`, to: monthEndInstant(month) }
}

/** The instant a month freezes: 30 days after it ends. */
export function freezeBoundary(month: string): string {
  return new Date(new Date(monthEndInstant(month)).getTime() + FREEZE_AFTER_DAYS * DAY_MS).toISOString()
}

/** Is this month still open to being rewritten, as at `now`? */
export function freezeStateFor(month: string, now: string): MonthStatus {
  return new Date(now).getTime() >= new Date(freezeBoundary(month)).getTime() ? 'frozen' : 'filling'
}

/** Every month start in `[from, to)`, ascending. A `to` inside a month includes
 *  that month: the reading of a part-month is what `filling` is for. */
export function monthsBetween(from: string, to: string): string[] {
  const end = new Date(to).getTime()
  if (Number.isNaN(end)) throw new Error(`monthsBetween: not a date: ${to}`)
  const out: string[] = []
  for (let m = monthStartOf(from); new Date(`${m}T00:00:00.000Z`).getTime() < end; m = nextMonth(m)) out.push(m)
  return out
}

/** The single window that covers a set of months, so a whole back-read can be
 *  one call rather than one call per month. */
export function windowOf(months: readonly string[]): { from: string; to: string } | null {
  if (months.length === 0) return null
  const sorted = [...months].sort()
  return { from: `${sorted[0]}T00:00:00.000Z`, to: monthEndInstant(sorted[sorted.length - 1]) }
}

/**
 * The months a live run has to read.
 *
 * Two sets, and both are needed. Every month that is still filling as at `now`
 * (the current one, and the previous one until its 30-day line passes) has to
 * be re-read because it is still moving. And every month that still has a
 * `filling` row stored has to be re-read too, even when its line has since
 * passed: that is the run that writes its final values and freezes it. Without
 * the second set an August row written in September would sit at its
 * mid-September numbers for ever, because by October nothing would look at it
 * again.
 *
 * Months that are frozen AND have no stored row are not here on purpose: those
 * are the back-read, and a run does not go looking for history it never took.
 * scripts/monthly-reading.ts seeds them once, deliberately, marked `back_read`.
 */
export function monthsToRefresh(now: string, storedFilling: readonly string[]): string[] {
  const out = new Set<string>(storedFilling.map(monthStartOf))
  let m = monthStartOf(now)
  // Walk back while the month is still open. Bounded by the freeze rule itself:
  // at 30 days this is at most the current month and the one before it.
  for (let guard = 0; guard < 12; guard++) {
    if (freezeStateFor(m, now) !== 'filling') break
    out.add(m)
    m = previousMonth(m)
  }
  return [...out].sort()
}

function previousMonth(month: string): string {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  return monthStartOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString())
}

/**
 * The `count` calendar months that had already ENDED at `instant`, oldest first.
 *
 * The anomaly check's left-hand side is a week and its right-hand side is "the
 * trailing three complete months" — complete as at the moment the week began,
 * not as at today, so a replay of an old week reads the baseline that week
 * actually had. The month the instant falls in is never complete (it is still
 * filling); the first instant of a month is the one edge case, and there the
 * month before it has just ended and counts.
 */
export function trailingCompleteMonths(instant: string, count: number): string[] {
  const t = new Date(instant).getTime()
  if (Number.isNaN(t)) throw new Error(`trailingCompleteMonths: not a date: ${instant}`)
  let m = monthStartOf(instant)
  for (let guard = 0; guard < 24 && new Date(monthEndInstant(m)).getTime() > t; guard++) m = previousMonth(m)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.unshift(m)
    m = previousMonth(m)
  }
  return out
}

// ---- ISO weeks ---------------------------------------------------------------
// The week is the anomaly check's unit and nothing else in the product speaks
// it. ISO, in UTC, because `comments.comment_date` is stored at UTC midnight and
// a week that starts at the server's local midnight would move a video between
// weeks depending on where the process happened to run.

/** The ISO year and week a UTC date falls in. */
export function isoWeekOf(iso: string): { year: number; week: number } {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) throw new Error(`isoWeekOf: not a date: ${iso}`)
  // The Thursday of a week decides which year the week belongs to.
  const thursday = new Date(d.getTime() + (4 - (d.getUTCDay() || 7)) * DAY_MS)
  const year = thursday.getUTCFullYear()
  const jan1 = Date.UTC(year, 0, 1)
  return { year, week: Math.floor((thursday.getTime() - jan1) / (7 * DAY_MS)) + 1 }
}

/** `2026-W37`, the label a replay prints. */
export const isoWeekLabel = (w: { year: number; week: number }): string => `${w.year}-W${String(w.week).padStart(2, '0')}`

/** One ISO week as a half-open window, Monday 00:00 UTC to the next Monday. */
export interface IsoWeek {
  year: number
  week: number
  label: string
  from: string
  to: string
}

/** The `count` ISO weeks that had fully ENDED before `now`, oldest first. The
 *  week `now` falls in is never one of them: a part-week is not a week, and the
 *  check's whole point is a like-for-like comparison. */
export function completeWeeksBefore(now: string, count: number): IsoWeek[] {
  const d = new Date(now)
  if (Number.isNaN(d.getTime())) throw new Error(`completeWeeksBefore: not a date: ${now}`)
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const mondayOfThisWeek = midnight - ((d.getUTCDay() || 7) - 1) * DAY_MS
  const out: IsoWeek[] = []
  for (let back = count; back >= 1; back--) {
    const from = mondayOfThisWeek - back * 7 * DAY_MS
    const fromIso = new Date(from).toISOString()
    const w = isoWeekOf(fromIso)
    out.push({ ...w, label: isoWeekLabel(w), from: fromIso, to: new Date(from + 7 * DAY_MS).toISOString() })
  }
  return out
}

/**
 * Does this week span two calendar months?
 *
 * It decides whether a week can be read at all. Both SQL functions group by
 * calendar month, so a week across a boundary arrives as two rows, and adding
 * them counts a video carrying comments on both sides twice: measured on
 * production, Össur's week 36 is 290 distinct videos and 372 added up — 28%
 * high, on the denominator every share in that week divides by. A caller
 * reading by month names and skips such a week instead of printing it wrong.
 *
 * `to` is exclusive, so the test is against the week's LAST instant: a week
 * ending exactly at a month boundary does not cross it.
 */
export function weekCrossesAMonth(week: { from: string; to: string }): boolean {
  const to = new Date(week.to).getTime()
  if (Number.isNaN(to)) throw new Error(`weekCrossesAMonth: not a date: ${week.to}`)
  return monthStartOf(week.from) !== monthStartOf(new Date(to - 1).toISOString())
}

/**
 * Is a day (`YYYY-MM-DD`, or any instant whose first ten characters are one)
 * inside the half-open window `[from, to)`?
 *
 * Compared as instants and never as strings. Every window here is built by a
 * different helper — `monthWindow`, `completeWeeksBefore`, a caller's own
 * concatenation — and `2026-09-07T00:00:00Z` and `2026-09-07T00:00:00.000Z` are
 * the same moment that do not compare equal as text. A lexicographic test works
 * only while every caller happens to spell the bound the same way, and fails
 * silently for the first one that does not.
 */
export function dayInWindow(day: string, window: { from: string; to: string }): boolean {
  const at = new Date(`${day.slice(0, 10)}T00:00:00.000Z`).getTime()
  if (Number.isNaN(at)) throw new Error(`dayInWindow: not a date: ${day}`)
  const from = new Date(window.from).getTime()
  const to = new Date(window.to).getTime()
  if (Number.isNaN(from) || Number.isNaN(to)) throw new Error(`dayInWindow: not a window: ${window.from}..${window.to}`)
  return at >= from && at < to
}

// ---- Keys and freeze state ---------------------------------------------------

/** A denominator row's identity: the table's primary key, minus the tenant. */
export const denominatorKey = (r: { month: string; audience: string }): string =>
  `${monthStartOf(r.month)}|${r.audience}`

/** A theme reading's identity. */
export const themeReadingKey = (r: { month: string; audience: string; theme_id: string }): string =>
  `${monthStartOf(r.month)}|${r.audience}|${r.theme_id}`

/**
 * The bookkeeping a row gets on this write.
 *
 * `origin` is decided once, at the first write, and never revisited: a row
 * first written while its month was filling stays `live` even when a later run
 * freezes it, and a row first written after the line stays `back_read` even
 * though it will never be rewritten. `frozen_at` is likewise the moment the row
 * FIRST froze, not the moment of this write.
 */
export function freezeFor(
  month: string,
  now: string,
  stored: Pick<StoredFreeze, 'origin' | 'frozen_at'> | undefined,
): { status: MonthStatus; origin: MonthOrigin; frozen_at: string | null } {
  const status = freezeStateFor(month, now)
  return {
    status,
    origin: stored?.origin ?? (status === 'frozen' ? 'back_read' : 'live'),
    frozen_at: status === 'frozen' ? (stored?.frozen_at ?? now) : null,
  }
}

export interface MergeResult<T> {
  /** Rows to upsert, freeze columns filled in. */
  writes: (T & FreezeColumns)[]
  /** Stored rows the fresh reading would have rewritten and did not, because
   *  they are frozen. The number that proves the promise was kept. */
  keptFrozen: number
  /** Stored FILLING rows in the months read that the fresh reading no longer
   *  produces — a theme that dropped out of this clustering, or an audience
   *  with no videos left in that month. They are deleted: `filling` means
   *  "this is what the current clustering says", and a stale row would be a
   *  number from a clustering nobody is using any more. Frozen rows are never
   *  in here, and neither is anything when `emptyReading`. */
  stale: StoredFreeze[]
  /** The fresh reading carried NO rows at all. */
  emptyReading: boolean
  /** Filling rows a non-empty reading would have deleted and this merge left
   *  standing, because the reading was empty. Loud on purpose: a run in this
   *  state wrote nothing and kept everything, and someone has to know. */
  heldStale: number
}

/**
 * Fold a fresh reading into what is already stored.
 *
 * The one invariant this file exists to keep: a frozen row is never rewritten
 * and never deleted. Everything else — which rows are new, which are being
 * refreshed, which have fallen out of the clustering — follows from that.
 *
 * `months` is the gate on BOTH sides. The reading arrives from one SQL call
 * over one contiguous window, so when the months asked for have a gap in them
 * (a stale March row alongside August and September) the answer carries the
 * months in between as well — and those arrive with no stored row read for
 * them, which would make a frozen April look new and overwrite it. A fresh row
 * whose month was not asked for is therefore dropped here.
 *
 * A reading that comes back completely empty is NOT "the clustering dropped
 * every theme" — it is no reading at all, and it deletes nothing. The shape
 * that produces it is ordinary: `persist-themes` writes `theme_observations`
 * only inside its registry block, that block is gated on an env flag
 * (`THEME_REGISTRY`) and wrapped in a catch that logs and lets the run close
 * `completed`, so a run with a registry failure — or any run after the flag is
 * unset — reaches this merge with zero observations. Treating that as an empty
 * clustering would delete every filling row in the months read, and on a visit
 * that was going to freeze them it would erase the month for good: no filling
 * row means no later visit, and the Pass A prune makes it unrecomputable for
 * that clustering. The rows are held instead, and the caller says so.
 */
export function mergeMonthRows<T extends { month: string }>(args: {
  /** The months the fresh reading covered. Stored rows outside them are not
   *  this merge's business and are left alone. */
  months: readonly string[]
  fresh: readonly T[]
  stored: readonly StoredFreeze[]
  keyOf: (row: T) => string
  now: string
  runId: string | null
}): MergeResult<T> {
  const { months, fresh, stored, keyOf, now, runId } = args
  const inWindow = new Set(months.map(monthStartOf))
  const storedByKey = new Map(stored.map((s) => [s.key, s]))
  const freshKeys = new Set<string>()

  const writes: (T & FreezeColumns)[] = []
  let keptFrozen = 0

  for (const row of fresh) {
    const month = monthStartOf(row.month)
    if (!inWindow.has(month)) continue
    const key = keyOf(row)
    freshKeys.add(key)
    const prior = storedByKey.get(key)
    if (prior?.status === 'frozen') {
      keptFrozen++
      continue
    }
    writes.push({ ...row, month, ...freezeFor(month, now, prior), read_at: now, run_id: runId })
  }

  const dropped = stored.filter(
    (s) => s.status === 'filling' && inWindow.has(monthStartOf(s.month)) && !freshKeys.has(s.key),
  )
  const emptyReading = fresh.length === 0
  return {
    writes,
    keptFrozen,
    stale: emptyReading ? [] : dropped,
    emptyReading,
    heldStale: emptyReading ? dropped.length : 0,
  }
}

// ---- Surviving a deploy that lands before its migration -----------------------

/** The four database objects 20260915092000_monthly_reading.sql creates. */
const MONTHLY_READING_OBJECTS = [
  RPC_DENOMINATORS,
  RPC_THEME_READINGS,
  TABLE_DENOMINATORS,
  TABLE_THEME_READINGS,
] as const

/**
 * Is this the error the reading gets before its migration lands?
 *
 * The migration is applied by hand, deliberately (it is a schema change on a
 * live pipeline), so a deploy CAN reach production first — and WP12 puts the
 * apply first precisely to avoid it. Without this test the freeze step throws
 * on every attempt, burns its whole Inngest retry budget with backoff between
 * attempts, and holds one of the account's five shared concurrency slots the
 * entire time, for a record it was never going to be able to write. The same
 * shape as `isMissingBookkeepingColumn` (WP1): narrow, named objects only,
 * never a blanket swallow.
 *
 * `selectAll` flattens a PostgREST error into a plain `Error` before it gets
 * here, so the code is usually gone and the sentence is what is left — hence
 * both are accepted, and both only alongside one of this migration's own names.
 */
export function isMissingMonthlyReading(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!MONTHLY_READING_OBJECTS.some((name) => text.includes(name))) return false
  // PGRST202 the function, PGRST205 the table, 42883/42P01 the same from Postgres.
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

// ---- Reading and writing ------------------------------------------------------

/** PostgREST caps a response at 1000 rows — on an RPC exactly as on a select —
 *  and Össur's theme reading is 1,346 rows for its history. Page it. */
async function callRpc<T>(admin: SupabaseClient, fn: string, params: Record<string, unknown>, order: string[]): Promise<T[]> {
  return selectAll<T>(() => {
    let q = admin.rpc(fn, params)
    for (const col of order) q = q.order(col, { ascending: true })
    return q
  })
}

/** The denominators for a window: how much conversation each audience carried,
 *  month by month. */
export async function readDenominators(
  admin: SupabaseClient,
  clientId: string,
  window: { from: string; to: string },
): Promise<DenominatorReading[]> {
  return callRpc<DenominatorReading>(
    admin,
    RPC_DENOMINATORS,
    { p_client: clientId, p_from: window.from, p_to: window.to },
    ['month', 'audience'],
  )
}

/** One run's clustering, read month by month. */
export async function readThemeReadings(
  admin: SupabaseClient,
  clientId: string,
  runId: string,
  window: { from: string; to: string },
): Promise<ThemeReading[]> {
  return callRpc<ThemeReading>(
    admin,
    RPC_THEME_READINGS,
    { p_client: clientId, p_run: runId, p_from: window.from, p_to: window.to },
    ['month', 'audience', 'theme_id'],
  )
}

/** The freeze columns of the stored rows — never their numbers. The merge
 *  decides from status and origin alone, so this reads what it needs and
 *  nothing else. */
interface StoredRow {
  month: string
  audience: string
  theme_id?: string | null
  status: MonthStatus
  origin: MonthOrigin
  frozen_at: string | null
}

const toStoredFreeze = (rows: readonly StoredRow[]): StoredFreeze[] =>
  rows.map((r) => {
    const theme_id = r.theme_id ?? null
    return {
      key: theme_id === null ? denominatorKey(r) : themeReadingKey({ ...r, theme_id }),
      month: monthStartOf(r.month),
      audience: r.audience,
      theme_id,
      status: r.status,
      origin: r.origin,
      frozen_at: r.frozen_at ?? null,
    }
  })

async function storedDenominators(
  admin: SupabaseClient, clientId: string, months: readonly string[],
): Promise<StoredFreeze[]> {
  if (months.length === 0) return []
  const rows = await selectAll<StoredRow>(() =>
    admin
      .from(TABLE_DENOMINATORS)
      .select('month, audience, status, origin, frozen_at')
      .eq('client_id', clientId)
      .in('month', [...months])
      .order('month', { ascending: true })
      .order('audience', { ascending: true }),
  )
  return toStoredFreeze(rows)
}

async function storedThemeReadings(
  admin: SupabaseClient, clientId: string, months: readonly string[],
): Promise<StoredFreeze[]> {
  if (months.length === 0) return []
  const rows = await selectAll<StoredRow>(() =>
    admin
      .from(TABLE_THEME_READINGS)
      .select('month, audience, theme_id, status, origin, frozen_at')
      .eq('client_id', clientId)
      .in('month', [...months])
      .order('month', { ascending: true })
      .order('audience', { ascending: true })
      .order('theme_id', { ascending: true }),
  )
  return toStoredFreeze(rows)
}

/** The months this tenant still has open, from the stored rows themselves.
 *  A month with a filling row has to be visited again even after its 30-day
 *  line passes — that visit is what freezes it.
 *
 *  Both reads page past 1000 rows on a UNIQUE order (each table's primary key
 *  minus the tenant): a page break on a non-unique key can skip rows, and a
 *  skipped row here is a month that never freezes. */
export async function fillingMonths(admin: SupabaseClient, clientId: string): Promise<string[]> {
  const [denoms, themes] = await Promise.all([
    selectAll<{ month: string }>(() =>
      admin
        .from(TABLE_DENOMINATORS)
        .select('month')
        .eq('client_id', clientId)
        .eq('status', 'filling')
        .order('month', { ascending: true })
        .order('audience', { ascending: true }),
    ),
    selectAll<{ month: string }>(() =>
      admin
        .from(TABLE_THEME_READINGS)
        .select('month')
        .eq('client_id', clientId)
        .eq('status', 'filling')
        .order('month', { ascending: true })
        .order('audience', { ascending: true })
        .order('theme_id', { ascending: true }),
    ),
  ])
  const out = new Set<string>()
  for (const r of [...denoms, ...themes]) out.add(monthStartOf(r.month))
  return [...out].sort()
}

/** Upsert on the primary key. The merge has already excluded every frozen row,
 *  and since 20260915092000 a `before update` trigger on both tables raises if
 *  one gets through anyway — so the narrow race (a row freezes between the read
 *  and this write) costs a failed step and a retry that re-reads, rather than
 *  the only copy of a month nobody can recompute. */
async function writeRows<T extends object>(
  admin: SupabaseClient,
  table: string,
  rows: readonly T[],
  onConflict: string,
): Promise<number> {
  let written = 0
  for (const part of chunk(rows, 500)) {
    const { error } = await admin.from(table).upsert(part, { onConflict })
    if (error) throw new Error(`${table} upsert: ${(error as { message?: string }).message ?? String(error)}`)
    written += part.length
  }
  return written
}

export interface FreezeSide {
  written: number
  frozen: number
  keptFrozen: number
  deleted: number
  /** Filling rows left standing because the reading came back empty — see
   *  `mergeMonthRows`. Anything but 0 means this run read nothing. */
  heldStale: number
}

export interface FreezeSummary {
  months: string[]
  denominators: FreezeSide
  themes: FreezeSide
}

/**
 * Read the given months and write them down.
 *
 * `runId` is the run whose clustering the theme numbers come from; pass null to
 * write denominators only (the seed does this for a tenant with no usable run).
 * Nothing here is destructive beyond the stale `filling` rows the merge names,
 * and `dryRun` stops before every write.
 */
export async function freezeMonths(
  admin: SupabaseClient,
  opts: {
    clientId: string
    runId: string | null
    months: readonly string[]
    now?: string
    dryRun?: boolean
  },
): Promise<FreezeSummary> {
  const now = opts.now ?? new Date().toISOString()
  const months = [...new Set(opts.months.map(monthStartOf))].sort()
  const empty: FreezeSummary = {
    months,
    denominators: { written: 0, frozen: 0, keptFrozen: 0, deleted: 0, heldStale: 0 },
    themes: { written: 0, frozen: 0, keptFrozen: 0, deleted: 0, heldStale: 0 },
  }
  const window = windowOf(months)
  if (!window) return empty

  // Denominators.
  const freshDenoms = await readDenominators(admin, opts.clientId, window)
  const storedDenoms = await storedDenominators(admin, opts.clientId, months)
  const denomMerge = mergeMonthRows({
    months, fresh: freshDenoms, stored: storedDenoms, keyOf: denominatorKey, now, runId: opts.runId,
  })
  const denomRows: DenominatorRow[] = denomMerge.writes.map((r) => ({ ...r, client_id: opts.clientId }))

  // Theme readings. A run is required: a theme number without a clustering to
  // attribute it to is not a reading of anything.
  let themeMerge: MergeResult<ThemeReading> = {
    writes: [], keptFrozen: 0, stale: [], emptyReading: false, heldStale: 0,
  }
  if (opts.runId) {
    const freshThemes = await readThemeReadings(admin, opts.clientId, opts.runId, window)
    const storedThemes = await storedThemeReadings(admin, opts.clientId, months)
    themeMerge = mergeMonthRows({
      months, fresh: freshThemes, stored: storedThemes, keyOf: themeReadingKey, now, runId: opts.runId,
    })
  }
  const themeRows: ThemeReadingRow[] = themeMerge.writes.map((r) => ({ ...r, client_id: opts.clientId }))

  const summary: FreezeSummary = {
    months,
    denominators: {
      written: denomRows.length,
      frozen: denomRows.filter((r) => r.status === 'frozen').length,
      keptFrozen: denomMerge.keptFrozen,
      deleted: denomMerge.stale.length,
      heldStale: denomMerge.heldStale,
    },
    themes: {
      written: themeRows.length,
      frozen: themeRows.filter((r) => r.status === 'frozen').length,
      keptFrozen: themeMerge.keptFrozen,
      deleted: themeMerge.stale.length,
      heldStale: themeMerge.heldStale,
    },
  }
  // An empty reading is a failure, not a result, and the rows it did not delete
  // are the only copy of those months. Say so wherever this runs — the pipeline
  // step, the inspector, a backfill — rather than leaving it to a caller.
  for (const [what, merge] of [['denominator', denomMerge], ['theme', themeMerge]] as const) {
    if (merge.emptyReading && merge.heldStale > 0) {
      console.error(
        `[monthly-reading] the ${what} reading for ${opts.clientId} came back EMPTY over ` +
        `${months.join(' ')} — ${merge.heldStale} filling rows held rather than deleted. ` +
        'Nothing was written for those months; find out why before the next run freezes them.',
      )
    }
  }
  if (opts.dryRun) return summary

  if (denomRows.length > 0) await writeRows(admin, TABLE_DENOMINATORS, denomRows, 'client_id,month,audience')
  if (themeRows.length > 0) await writeRows(admin, TABLE_THEME_READINGS, themeRows, 'client_id,month,audience,theme_id')
  await deleteStale(admin, TABLE_DENOMINATORS, opts.clientId, denomMerge.stale)
  await deleteStale(admin, TABLE_THEME_READINGS, opts.clientId, themeMerge.stale)
  return summary
}

/** Delete the stale filling rows the merge named, one primary key at a time and
 *  with `status = 'filling'` restated on every delete — so a row that froze
 *  between the read and this write survives the race rather than losing the
 *  only copy of a month nobody can recompute. */
async function deleteStale(
  admin: SupabaseClient,
  table: string,
  clientId: string,
  stale: readonly StoredFreeze[],
): Promise<void> {
  for (const s of stale) {
    let q = admin
      .from(table)
      .delete()
      .eq('client_id', clientId)
      .eq('month', s.month)
      .eq('audience', s.audience)
      .eq('status', 'filling')
    if (s.theme_id !== null) q = q.eq('theme_id', s.theme_id)
    const { error } = await q
    if (error) throw new Error(`${table} delete: ${(error as { message?: string }).message ?? String(error)}`)
  }
}
