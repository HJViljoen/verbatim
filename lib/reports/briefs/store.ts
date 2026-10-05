import type { SupabaseClient } from '@supabase/supabase-js'

import { longMonth } from '../../format'
import { freezeStateFor } from '../../reading/monthly'
import { createSnapshot } from '../../snapshots'
import { stampSnapshotReading } from '../reading-stamp'
import type { BriefRole, MonthlyBriefData } from './types'
import { BRIEF_NAME, BRIEF_ROLES } from './types'

// Where the month's briefs live (the pipeline's `briefs:compose` step, and the
// script's --write).
//
// THE BRIEF ITSELF IS A REPORT SNAPSHOT: one `report_snapshots` row per role
// per month, kind 'report', `data.kind = 'monthly_brief'` (the arranged
// artefacts' rule, AGENTS.md), frozen through `createSnapshot`, so every quote
// is a ref with `text: ''` and its refs are `evidence_ids` (which is also what
// keeps a cited insight from being pruned: `citedEvidenceIds` protects frozen
// exports). Numbers are frozen, words resolve at render. The viewer, the
// render route, the PDF and erasure all already read that table.
//
// THE LEDGER IS `monthly_briefs` (migration 20261107090000): one row per
// client, month and role, saying whether that brief is ready, thin or failed,
// which snapshot is the month's, which run wrote it and what it cost. It is
// what a later run asks before writing a month again, where a failure is
// stored, and what the Studio lists. Service role only: a tenant's session
// reads nothing there; the Studio reads it with the service role, scoped to
// the session's own client.

export const MONTHLY_BRIEFS_TABLE = 'monthly_briefs'

export type MonthlyBriefStatus = 'ready' | 'thin' | 'failed'

export interface MonthlyBriefRow {
  client_id: string
  /** `YYYY-MM-01`. */
  month: string
  role: BriefRole
  run_id: string | null
  status: MonthlyBriefStatus
  snapshot_id: string | null
  cost_usd: number
  /** Why it failed or is thin; the operator's, never a reader's. */
  error: string | null
}

/** The table is not in this database yet (its migration has not been
 *  applied): Postgres' undefined_table, or PostgREST's schema-cache miss. */
export function isMissingMonthlyBriefs(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = error.message ?? ''
  return /monthly_briefs/.test(message) && /does not exist|schema cache/.test(message)
}

/** Is the ledger there? One head read, no rows. */
export async function monthlyBriefsApplied(admin: SupabaseClient): Promise<boolean> {
  const res = await admin.from(MONTHLY_BRIEFS_TABLE).select('id', { count: 'exact', head: true }).limit(0)
  if (!res.error) return true
  if (isMissingMonthlyBriefs(res.error)) return false
  throw new Error(`monthly_briefs: ${res.error.message}`)
}

/** Is the month's set written already: every role ready or thin? A failed
 *  set is not written (the script writes it). */
export async function monthBriefsWritten(admin: SupabaseClient, clientId: string, month: string): Promise<boolean> {
  const res = await admin.from(MONTHLY_BRIEFS_TABLE).select('role, status').eq('client_id', clientId).eq('month', month)
  if (res.error) throw new Error(`monthly_briefs written: ${res.error.message}`)
  return setWritten((res.data ?? []) as { role: string; status: string }[])
}

/** Every role has a ready or thin row. Pure. */
export const setWritten = (rows: readonly { role: string; status: string }[]): boolean =>
  BRIEF_ROLES.every((r) => rows.some((x) => x.role === r && (x.status === 'ready' || x.status === 'thin')))

/** Write ledger rows, replacing each (client, month, role)'s earlier row. */
export async function saveBriefRows(admin: SupabaseClient, rows: readonly MonthlyBriefRow[]): Promise<void> {
  if (rows.length === 0) return
  const res = await admin.from(MONTHLY_BRIEFS_TABLE).upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'client_id,month,role' })
  if (res.error) throw new Error(`monthly_briefs write: ${res.error.message}`)
}

/** The failed set's four rows. */
export function failedRows(clientId: string, month: string, runId: string | null, error: string): MonthlyBriefRow[] {
  return BRIEF_ROLES.map((role) => ({ client_id: clientId, month, role, run_id: runId, status: 'failed', snapshot_id: null, cost_usd: 0, error: error.slice(0, 1000) }))
}

/** Does a composed brief print anything beyond its In short? A brief with no
 *  finding and no section is thin: it is recorded, never shown. Pure. */
export const briefPrints = (d: Pick<MonthlyBriefData, 'findings' | 'sections'>): boolean => d.findings.length > 0 || d.sections.length > 0

/** The brief's title as the Studio and the PDF name it: "Sales brief ·
 *  September 2026". Pure. */
export const briefTitle = (d: Pick<MonthlyBriefData, 'role' | 'month'>): string => `${BRIEF_NAME[d.role]} · ${longMonth(d.month)} ${d.month.slice(0, 4)}`

/** The snapshot's ref: which artefact, for which month. */
export const briefRef = (d: Pick<MonthlyBriefData, 'role' | 'month'>) => ({ artefact: `brief:${d.role}`, params: { month: d.month.slice(0, 7), role: d.role } })

/**
 * Freeze one brief as the month's snapshot and stamp what it is a reading of.
 * The stamp is the non-fatal update every artefact makes (reading-stamp.ts).
 */
export async function storeBriefSnapshot(
  admin: SupabaseClient,
  a: { clientId: string; runId: string | null; data: MonthlyBriefData; asOf: string },
): Promise<{ id: string; evidenceIds: string[] }> {
  const snap = await createSnapshot(admin, {
    clientId: a.clientId,
    userId: null,
    kind: 'report',
    ref: briefRef(a.data),
    title: briefTitle(a.data),
    runId: a.runId,
    data: a.data,
  })
  await stampSnapshotReading(admin, a.clientId, snap.id, {
    readingAt: a.asOf,
    month: a.data.month,
    monthStatus: freezeStateFor(a.data.month, a.asOf),
    windowBasis: 'month',
  }).catch((e: unknown) => console.warn(`[briefs] reading stamp not written on ${snap.id}: ${e instanceof Error ? e.message : String(e)}`))
  return snap
}

/**
 * Store a composed set: each brief that prints as its snapshot, then the
 * ledger's four rows (ready with the snapshot, or thin with why). The
 * snapshots go first, so a ledger row never names a snapshot that is not
 * there; a set stored twice (a retried step) leaves an earlier snapshot no row
 * names, which nothing lists.
 */
export async function storeBriefSet(
  admin: SupabaseClient,
  a: { clientId: string; runId: string | null; month: string; asOf: string; briefs: readonly MonthlyBriefData[]; costUsd: Partial<Record<BriefRole, number>> },
): Promise<MonthlyBriefRow[]> {
  const rows: MonthlyBriefRow[] = []
  for (const d of a.briefs) {
    const cost = Math.round((a.costUsd[d.role] ?? 0) * 10_000) / 10_000
    if (!briefPrints(d)) {
      rows.push({ client_id: a.clientId, month: a.month, role: d.role, run_id: a.runId, status: 'thin', snapshot_id: null, cost_usd: cost, error: 'nothing in it stood: no finding and no section' })
      continue
    }
    const snap = await storeBriefSnapshot(admin, { clientId: a.clientId, runId: a.runId, data: d, asOf: a.asOf })
    rows.push({ client_id: a.clientId, month: a.month, role: d.role, run_id: a.runId, status: 'ready', snapshot_id: snap.id, cost_usd: cost, error: null })
  }
  await saveBriefRows(admin, rows)
  return rows
}
