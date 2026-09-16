import type { SupabaseClient } from '@supabase/supabase-js'
import { monthDate } from './sent-figures'
import type { MonthlyStatus } from './monthly'

/**
 * Stamping a snapshot with what it is a reading OF (Phase 1 WP18, migration M9).
 *
 * WHY IT IS AN UPDATE AND NOT PART OF THE INSERT. `createSnapshot` is the one
 * door every artefact in the product goes through — pages, tiles, agent
 * threads, arranged reports, documents, and now two artefacts — and four of
 * those six have no month and no reading date to stamp. Adding four columns to
 * its insert would make every caller answer a question only two of them have,
 * and would make the whole insert fail on a deploy that reaches production
 * before M9 is applied in the R2 window.
 *
 * SO IT IS A SEPARATE, NON-FATAL WRITE. The artefact is already stored when
 * this runs; a missing migration or a failed stamp leaves the snapshot exactly
 * as it is today — `data.readingAt` is still inside it, which is where WP17 put
 * the reading date and where M9's own backfill reads it from. The columns are
 * what make it QUERYABLE; the fact itself is not lost without them.
 *
 * Returns whether the stamp landed, so a caller can log the difference rather
 * than guess at it.
 */

export interface ReadingStamp {
  readingAt: string
  /** 'YYYY-MM' or 'YYYY-MM-DD'; stored as the month's first day. */
  month: string
  monthStatus: MonthlyStatus
  /** What the frozen numbers are a reading over. 'month' for both artefacts
   *  this package writes; the vocabulary has room for the brief rebase (WP19)
   *  and the quarterly review (WP20). */
  windowBasis: 'month' | 'quarter' | 'update_window' | 'run' | 'cumulative'
}

/** Is M9 simply not applied here? Narrow by name — a column this migration adds
 *  and no other. */
export function isMissingReadingColumns(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!/reading_at|month_status|window_basis/.test(text)) return false
  if (code && ['PGRST204', '42703'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text) || /column/i.test(text)
}

/**
 * AND THE TENANT IS ON THE WRITE. This was the block's one service-role UPDATE
 * keyed by `id` alone. Not reachable today — the id comes from a snapshot the
 * same call just created — but every other service-role write in this block
 * pairs the id with `client_id`, the function is exported, and the brief's
 * freeze path and the quarterly review are the next two callers. A parameter.
 */
export async function stampSnapshotReading(
  admin: SupabaseClient,
  clientId: string,
  snapshotId: string,
  stamp: ReadingStamp,
): Promise<boolean> {
  const { error } = await admin
    .from('report_snapshots')
    .update({
      reading_at: stamp.readingAt,
      month: monthDate(stamp.month),
      month_status: stamp.monthStatus,
      window_basis: stamp.windowBasis,
    })
    .eq('client_id', clientId)
    .eq('id', snapshotId)
  if (!error) return true
  if (isMissingReadingColumns(error)) return false
  throw error
}
