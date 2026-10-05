import type { SupabaseClient } from '@supabase/supabase-js'

import { markSnapshotsStale } from '../../artifacts'
import { longMonth } from '../../format'
import { freezeStateFor } from '../../reading/monthly'
import { freezeQuotes } from '../../renderables/quotes-freeze'
import { createSnapshot } from '../../snapshots'
import { stampSnapshotReading } from '../reading-stamp'
import type { BriefRole, MonthlyBriefData } from './types'
import { BRIEF_NAME, BRIEF_ROLES, storedBrief } from './types'

// Where the month's briefs live (the pipeline's `briefs:compose` step, and the
// script's --write).
//
// THE BRIEF ITSELF IS A REPORT SNAPSHOT: one `report_snapshots` row per role
// per month, kind 'report', `data.kind = 'monthly_brief'` (the arranged
// artefacts' rule, AGENTS.md), frozen through `createSnapshot`, so every quote
// is a ref with `text: ''` and its refs are `evidence_ids` (which is also what
// keeps a cited insight from being pruned: `citedEvidenceIds` protects frozen
// exports). Numbers are frozen, words resolve at render. The viewer, the
// render route, the PDF and erasure all already read that table. A tenant's
// session reads that row, so its `data` is the brief less what was held and
// what it cost (`storedBrief`); those are the ledger's.
//
// ONE SNAPSHOT PER (client, month, role), found by its ref: a retried compose
// step, or the script's --replace, rewrites the role's snapshot in place
// (its stored PDF flagged stale, so the next download prints the new one)
// rather than adding a second, and a role that is thin this time has its
// earlier snapshot removed. No retry leaves a snapshot no ledger row names.
//
// THE LEDGER IS `monthly_briefs` (migration 20261107093000): one row per
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
  /** What the brief wrote and does not print, and why: the operator's,
   *  never in the snapshot a tenant reads. */
  held: MonthlyBriefData['held']
}

/** The table is not in this database yet (its migration has not been
 *  applied): Postgres' undefined_table, or PostgREST's schema-cache miss. */
export function isMissingMonthlyBriefs(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = error.message ?? ''
  return /monthly_briefs/.test(message) && /does not exist|schema cache/.test(message)
}

/** Is the ledger there? One read of at most one id. Not a HEAD read: a HEAD
 *  on a table PostgREST does not know comes back 404 with no body, which
 *  supabase-js reports as no error at all (measured against production
 *  before the migration, 5 Oct), so a missing table would read as there. */
export async function monthlyBriefsApplied(admin: SupabaseClient): Promise<boolean> {
  const res = await admin.from(MONTHLY_BRIEFS_TABLE).select('id').limit(1)
  if (res.error) {
    if (isMissingMonthlyBriefs(res.error)) return false
    throw new Error(`monthly_briefs: ${res.error.message}`)
  }
  return res.status !== 404
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
  return BRIEF_ROLES.map((role) => ({ client_id: clientId, month, role, run_id: runId, status: 'failed', snapshot_id: null, cost_usd: 0, error: error.slice(0, 1000), held: [] }))
}

/** Does a composed brief print anything beyond its In short? A brief with no
 *  finding and no section is thin: it is recorded, never shown. Pure. */
export const briefPrints = (d: Pick<MonthlyBriefData, 'findings' | 'sections'>): boolean => d.findings.length > 0 || d.sections.length > 0

/** The brief's title as the Studio and the PDF name it: "Sales brief ·
 *  September 2026". Pure. */
export const briefTitle = (d: Pick<MonthlyBriefData, 'role' | 'month'>): string => `${BRIEF_NAME[d.role]} · ${longMonth(d.month)} ${d.month.slice(0, 4)}`

/** Is this a snapshot id at all? The PDF route answers anything else "no
 *  such brief" before it reads, rather than letting Postgres refuse the cast
 *  (a 503 "could not read"). Pure. */
export const isBriefSnapshotId = (x: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)

/** The snapshot's ref: which artefact, for which month. */
export const briefRef = (d: Pick<MonthlyBriefData, 'role' | 'month'>) => ({ artefact: `brief:${d.role}`, params: { month: d.month.slice(0, 7), role: d.role } })

/** The role's stored snapshot for the month, by its ref: the newest, where
 *  an earlier store left more than one. */
export async function briefSnapshotOf(admin: SupabaseClient, clientId: string, month: string, role: BriefRole): Promise<string | null> {
  const ref = briefRef({ role, month })
  const res = await admin.from('report_snapshots').select('id')
    .eq('client_id', clientId).eq('kind', 'report')
    .eq('ref->>artefact', ref.artefact).eq('ref->params->>month', ref.params.month)
    .order('created_at', { ascending: false }).limit(1)
  if (res.error) throw new Error(`brief snapshot: ${res.error.message}`)
  return ((res.data ?? [])[0] as { id: string } | undefined)?.id ?? null
}

/**
 * Freeze one brief as the month's snapshot and stamp what it is a reading of:
 * the role's existing snapshot rewritten in place (its stored files flagged
 * stale), else a new one. The stamp is the non-fatal update every artefact
 * makes (reading-stamp.ts).
 */
export async function storeBriefSnapshot(
  admin: SupabaseClient,
  a: { clientId: string; runId: string | null; data: MonthlyBriefData; asOf: string },
): Promise<{ id: string; evidenceIds: string[] }> {
  const data = storedBrief(a.data)
  const existing = await briefSnapshotOf(admin, a.clientId, a.data.month, a.data.role)
  let snap: { id: string; evidenceIds: string[] }
  if (existing) {
    const { data: frozen, refs } = freezeQuotes(data)
    const res = await admin.from('report_snapshots')
      .update({ data: frozen, evidence_ids: refs, title: briefTitle(a.data), run_id: a.runId })
      .eq('id', existing).eq('client_id', a.clientId)
    if (res.error) throw new Error(`brief snapshot: update failed: ${res.error.message}`)
    await markSnapshotsStale(admin, [existing], { apply: true })
    snap = { id: existing, evidenceIds: refs }
  } else {
    snap = await createSnapshot(admin, {
      clientId: a.clientId,
      userId: null,
      kind: 'report',
      ref: briefRef(a.data),
      title: briefTitle(a.data),
      runId: a.runId,
      data,
    })
  }
  await stampSnapshotReading(admin, a.clientId, snap.id, {
    readingAt: a.asOf,
    month: a.data.month,
    monthStatus: freezeStateFor(a.data.month, a.asOf),
    windowBasis: 'month',
  }).catch((e: unknown) => console.warn(`[briefs] reading stamp not written on ${snap.id}: ${e instanceof Error ? e.message : String(e)}`))
  return snap
}

/** A role that is thin this time: its earlier snapshot for the month, if a
 *  first attempt or an earlier write left one, is removed (its files go with
 *  it), so no snapshot stands that the ledger does not name. */
async function dropBriefSnapshot(admin: SupabaseClient, clientId: string, month: string, role: BriefRole): Promise<void> {
  const existing = await briefSnapshotOf(admin, clientId, month, role)
  if (!existing) return
  await markSnapshotsStale(admin, [existing], { apply: true })
  const res = await admin.from('report_snapshots').delete().eq('id', existing).eq('client_id', clientId)
  if (res.error) throw new Error(`brief snapshot: delete failed: ${res.error.message}`)
  console.warn(`[briefs] the ${role} brief for ${month} is thin this time; its earlier snapshot ${existing} was removed`)
}

/**
 * Store a composed set: each brief that prints as its snapshot (one per
 * client, month and role), then the ledger's four rows (ready with the
 * snapshot, or thin with why; each with what it held and what it cost). The
 * snapshots go first, so a ledger row never names a snapshot that is not
 * there; stored twice (a retried step), the second store rewrites the first's
 * snapshots and rows rather than adding to them.
 */
export async function storeBriefSet(
  admin: SupabaseClient,
  a: { clientId: string; runId: string | null; month: string; asOf: string; briefs: readonly MonthlyBriefData[]; costUsd: Partial<Record<BriefRole, number>> },
): Promise<MonthlyBriefRow[]> {
  const rows: MonthlyBriefRow[] = []
  for (const d of a.briefs) {
    const cost = Math.round((a.costUsd[d.role] ?? d.costUsd ?? 0) * 10_000) / 10_000
    if (!briefPrints(d)) {
      await dropBriefSnapshot(admin, a.clientId, a.month, d.role)
      rows.push({ client_id: a.clientId, month: a.month, role: d.role, run_id: a.runId, status: 'thin', snapshot_id: null, cost_usd: cost, error: 'nothing in it stood: no finding and no section', held: d.held })
      continue
    }
    const snap = await storeBriefSnapshot(admin, { clientId: a.clientId, runId: a.runId, data: d, asOf: a.asOf })
    rows.push({ client_id: a.clientId, month: a.month, role: d.role, run_id: a.runId, status: 'ready', snapshot_id: snap.id, cost_usd: cost, error: null, held: d.held })
  }
  await saveBriefRows(admin, rows)
  return rows
}
