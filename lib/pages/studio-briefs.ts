import type { SupabaseClient } from '@supabase/supabase-js'

import { monthYear } from '../reports/briefs/deck'
import { isMissingMonthlyBriefs, MONTHLY_BRIEFS_TABLE } from '../reports/briefs/store'
import { BRIEF_ROLES, isBriefRole, type BriefRole } from '../reports/briefs/types'
import { issueDay, STUDIO_REPORTS, type StudioArtefact } from './studio'

/**
 * The Studio's "Monthly briefs" (T8 wired, 5 Oct; Heinrich: "a finished run
 * reaches the platform by itself; review holds ONLY the email"). Every month's
 * department briefs the pipeline wrote, ready, newest month first, each to
 * open in the viewer and download as a PDF. There is no email here, so
 * nothing holds them: a brief is on the platform the moment its run stores it.
 *
 * WHAT IT LISTS: `monthly_briefs` rows that are `ready` and name a snapshot.
 * A thin or failed brief is the operator's to know (the alert, the ledger),
 * never a row a client reads. The August document engine's brief builds are
 * not in this table and never listed here, and "Your reports"' brief rows
 * (which are about email schedules no brief has yet) stay hidden
 * (`BRIEFS_BUILT`).
 *
 * The ledger is service role only: the page reads it with the service role,
 * scoped to the session's own client, as the published read is read.
 */

export interface StudioBrief {
  snapshotId: string
  role: BriefRole
  /** "Sales brief". */
  name: string
  /** The Studio's line for it ("Who is buying, what holds them back…"). */
  what: string
  /** "Sales". */
  forWho: string
  /** `YYYY-MM-01`. */
  month: string
  /** "September 2026". */
  monthLabel: string
  /** "Mon 5 Oct": the day its run wrote it. */
  writtenOn: string
}

export interface MonthlyBriefRowRead {
  role: string
  month: string
  status: string
  snapshot_id: string | null
  created_at?: string | null
  updated_at?: string | null
  report_snapshots?: { created_at: string | null } | { created_at: string | null }[] | null
}

/** The ledger's rows as the card lists them: ready, with a snapshot, newest
 *  month first and the four in the Studio's order. Pure. */
export function studioBriefs(rows: readonly MonthlyBriefRowRead[]): StudioBrief[] {
  return rows
    .filter((r): r is MonthlyBriefRowRead & { snapshot_id: string; role: BriefRole } => r.status === 'ready' && !!r.snapshot_id && isBriefRole(r.role))
    .map((r) => {
      const def = STUDIO_REPORTS.find((x) => x.artefact === (`brief:${r.role}` as StudioArtefact))
      const snap = Array.isArray(r.report_snapshots) ? r.report_snapshots[0] : r.report_snapshots
      const at = snap?.created_at ?? r.updated_at ?? r.created_at ?? null
      const month = String(r.month).slice(0, 10)
      return {
        snapshotId: r.snapshot_id,
        role: r.role,
        name: def?.name ?? r.role,
        what: def?.what('') ?? '',
        forWho: def?.forWho ?? '',
        month,
        monthLabel: monthYear(month),
        writtenOn: at ? issueDay(at) : '',
      }
    })
    .sort((a, b) => b.month.localeCompare(a.month) || BRIEF_ROLES.indexOf(a.role) - BRIEF_ROLES.indexOf(b.role))
}

/** A client's ready briefs. A database without the ledger has none; a read
 *  that fails loses only this card (logged), never the page. */
export async function loadStudioBriefs(admin: SupabaseClient, clientId: string): Promise<StudioBrief[]> {
  const res = await admin.from(MONTHLY_BRIEFS_TABLE)
    .select('role, month, status, snapshot_id, created_at, updated_at, report_snapshots(created_at)')
    .eq('client_id', clientId).eq('status', 'ready').not('snapshot_id', 'is', null)
    .order('month', { ascending: false }).limit(48)
  if (res.error) {
    if (!isMissingMonthlyBriefs(res.error)) console.error(`[studio] monthly briefs not read: ${res.error.message}`)
    return []
  }
  return studioBriefs((res.data ?? []) as MonthlyBriefRowRead[])
}
