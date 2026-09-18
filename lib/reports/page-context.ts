import type { SupabaseClient } from '@supabase/supabase-js'

import { longMonth, shortDate } from '../format'
import { deliveryRecord, updatesInMonth, type DeliveryRecord } from '../settings/delivery'
import { freezeStateFor, monthStartOf } from '../reading/monthly'
import { methodLines, type MethodLines } from '../reading/method'
import { loadRecordInputs, monthRecordWindow } from '../reading/record'
import { contextLine } from '../shell/bar'
import { selectAll } from '../supabase-admin'
import type { UpdateInput } from '../readiness/types'
import type { MonthStatus } from '../reading/types'

/**
 * The Reports page's one reading handle (Block D wave 2, package E-reports;
 * `reports.shell`, `reports.archive.header`, `reports.archive.filter` and
 * `reports.method.footer` in status/mock-gap.md §4/§5).
 *
 * THE DESIGN DECISION THE BRIEF ASKED FOR, MADE HERE. Reports states no
 * reading of a month — `lib/nav.ts` gives it `bar: 'title'` for exactly that
 * reason — so the artboard's context line ("Sealand · September 2026 · still
 * filling · as at 28 Sep") and its two-line method footnote had no loader to
 * hang off, and the brief's instruction was: either give the page a minimal
 * handle and print the real footnote, or print nothing and say why. This is
 * the minimal handle. It reads three things and composes nothing twice:
 *
 *   · the workspace's own name, for the context line and "Prepared for …";
 *   · every update on record, ONE `pipeline_runs` read, which answers the
 *     archive's delivery meta AND the four preset chips AND the dated line
 *     beside them — three elements the mock draws from one fact;
 *   · the record for the month in hand, which `methodLines` turns into the
 *     footnote the mock prints word for word.
 *
 * WHAT IT DELIBERATELY DOES NOT DO IS READ THE MONTH SERIES. The month a
 * reader is in and whether it is still filling are the calendar's answer, not
 * a table's — `freezeStateFor` is the rule (`lib/reading/monthly.ts`), and
 * Reports makes no claim about what is IN the month, so a denominator read
 * would buy nothing and would make the page fail where the month tables are
 * not applied. The page's numbers are all elsewhere: the quarterly card reads
 * its own windows, the briefs print the figures their last build froze.
 *
 * `bar` STAYS `'title'`. Nothing here turns the horizon control or the
 * soundness band on — `hasHorizon` and `hasRecord` are untouched, and the page
 * composes `PageBar` itself rather than going through `SurfacePageBar`, so no
 * other surface's bar moves because Reports gained a context line.
 *
 * EVERY PART DEGRADES ALONE. A failed read costs its own line and nothing
 * else: no brand is "Your workspace", no runs is no delivery meta and no
 * preset counts, no record is no footnote. The archive below this has never
 * needed any of it.
 */

export interface ArchivePreset {
  /** The month start it selects, or `all`. */
  key: string
  /** "September", "Since we started". */
  label: string
  /** Inclusive day bounds for the archive's own date filter, or null for no
   *  bound — the same shape `parseDateFilter` reads out of the URL. */
  from: string | null
  to: string | null
  /** Updates delivered inside it. */
  updates: number
  /** The days those updates ran, oldest first, in the reader's short form. */
  dates: string[]
}

export interface ReportsPageContext {
  brand: string
  /** The month in hand, `YYYY-MM-01`. */
  month: string
  monthStatus: MonthStatus
  readingAt: string
  /** The page bar's mono line — `contextLine`, the same composer the five
   *  reading surfaces use. */
  context: string
  /** Every update on record, all-time. Null where the read failed. */
  delivery: DeliveryRecord | null
  /** The mock's four chips: this month, the two before it, and all-time. */
  presets: ArchivePreset[]
  /** The method footnote. Null where the record could not be read. */
  method: MethodLines | null
}

/**
 * "4 updates in September · 6, 13, 20, 27 Sep".
 *
 * IT COUNTS UPDATES, NOT ARCHIVE ITEMS. The built page's own filter line
 * (`dateFilterLine`) counts rows in a capped list and says so; this one counts
 * DELIVERIES, which is what the mock's line is about and what a reader
 * choosing "August" is really asking. Both print, one under the other, because
 * they answer different questions.
 *
 * The dates are dropped past eight: a chip line is one line, and "Since we
 * started" on a two-year workspace is not a list.
 */
export function presetLine(p: ArchivePreset): string {
  const where = p.key === 'all' ? 'on record' : `in ${p.label}`
  if (p.updates === 0) return `No update ${where}.`
  const head = `${p.updates} update${p.updates === 1 ? '' : 's'} ${where}`
  return p.dates.length > 0 && p.dates.length <= 8 ? `${head} · ${collapseMonth(p.dates)}` : head
}

/**
 * "6 Sep, 13 Sep, 20 Sep, 27 Sep" → "6, 13, 20, 27 Sep", the artboard's own
 * form — but ONLY where every date is in one month. A chip's dates are always
 * one month's; a caller that hands this a list crossing one gets the month on
 * every date, because "6, 13, 20, 27 Sep" about two Septembers is two lies in
 * one line.
 */
export function collapseMonth(dates: readonly string[]): string {
  const months = new Set(dates.map((d) => d.split(' ').slice(1).join(' ')))
  if (months.size !== 1 || dates.length < 2) return dates.join(', ')
  const days = dates.map((d) => d.split(' ')[0])
  return `${days.slice(0, -1).join(', ')}, ${dates[dates.length - 1]}`
}

/** The last day of a month, `YYYY-MM-DD` — the preset's inclusive upper
 *  bound, because a reader picking "August" means all of August. */
export function lastDayOf(month: string): string {
  const start = monthStartOf(month)
  const d = new Date(`${start}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10)
}

/** The month `n` months before this one. */
const monthBefore = (month: string, n: number): string => {
  const d = new Date(`${monthStartOf(month)}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * The four chips, from the updates alone.
 *
 * Pure, so the counts and the dated line are testable without a database —
 * and so the rule that a preset's bound is a DAY (what the archive's filter
 * compares) is written once.
 */
export function archivePresets(updates: readonly UpdateInput[], month: string): ArchivePreset[] {
  const months = [month, monthBefore(month, 1), monthBefore(month, 2)]
  const delivered = updates.filter((u) => u.status === 'completed' || u.status === 'partial')
  const monthChips = months.map((m) => {
    const inMonth = updatesInMonth(delivered, m.slice(0, 7))
    return {
      key: m,
      label: longMonth(m),
      from: m,
      to: lastDayOf(m),
      updates: inMonth.length,
      // `updatesInMonth` hands them back newest first; a dated list reads
      // oldest first, the way the mock draws it ("6, 13, 20, 27 Sep").
      dates: [...inMonth].reverse().map((u) => shortDate(u.startedAt)),
    }
  })
  return [
    ...monthChips,
    {
      key: 'all',
      label: 'Since we started',
      from: null,
      to: null,
      updates: delivered.length,
      dates: [],
    },
  ]
}

/** Which preset the reader's current filter is, or null for a hand-typed
 *  range. `all` is the chip a page with no filter is sitting on. */
export function activePreset(
  presets: readonly ArchivePreset[],
  filter: { from: string | null; to: string | null },
): string | null {
  const hit = presets.find((p) => p.from === filter.from && p.to === filter.to)
  return hit ? hit.key : null
}

/**
 * The I/O half. Three reads, each guarded on its own.
 *
 * `supabase` is the session client — every read here is the tenant's own and
 * is already RLS-scoped, exactly as the archive's reads on the same page are.
 */
export async function loadReportsPageContext(
  supabase: SupabaseClient,
  clientId: string,
  opts: { now?: string } = {},
): Promise<ReportsPageContext> {
  const readingAt = opts.now ?? new Date().toISOString()
  const month = monthStartOf(readingAt)
  const monthStatus = freezeStateFor(month, readingAt)

  type RunRow = { id: string; started_at: string | null; completed_at: string | null; status: string }
  const [brand, updates] = await Promise.all([
    (async (): Promise<string | null> => {
      try {
        const res = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle()
        return (res.data as { company_name?: string | null } | null)?.company_name ?? null
      } catch (e) {
        console.error(`[reports-context] brand: ${msg(e)}`)
        return null
      }
    })(),
    selectAll<RunRow>(() =>
      supabase
        .from('pipeline_runs')
        .select('id, started_at, completed_at, status')
        .eq('client_id', clientId)
        .order('started_at', { ascending: true }),
    ).catch((e: unknown) => {
      console.error(`[reports-context] updates: ${msg(e)}`)
      return null
    }),
  ])

  const brandName = brand ?? 'Your workspace'
  const runs: UpdateInput[] | null = updates
    ? updates
        .filter((r: RunRow): r is RunRow & { started_at: string } => typeof r.started_at === 'string')
        .map((r): UpdateInput => ({ id: r.id, status: r.status, startedAt: r.started_at, completedAt: r.completed_at }))
    : null

  // THE METHOD FOOTNOTE IS THE MONTH'S, and the month is the one the context
  // line names. `monthRecordWindow` is the same window every reading surface
  // composes, so the coverage clause here and the coverage clause on Overview
  // are one figure and not two.
  const method = await loadRecordInputs(supabase, clientId, monthRecordWindow(month, readingAt), { now: readingAt })
    .then((inputs) => methodLines(inputs, { brand: brand ?? null, readingAt }))
    .catch((e: unknown) => {
      console.error(`[reports-context] record: ${msg(e)}`)
      return null
    })

  return {
    brand: brandName,
    month,
    monthStatus,
    readingAt,
    context: contextLine({ brand: brandName, month, status: monthStatus, readingAt }),
    delivery: runs ? deliveryRecord({ updates: runs, slotsRecorded: false }) : null,
    presets: archivePresets(runs ?? [], month),
    method,
  }
}

const msg = (e: unknown): string => (e as { message?: string })?.message ?? String(e)
