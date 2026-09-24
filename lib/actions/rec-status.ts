'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getSessionContext } from '@/lib/auth'
import { REC_STATUSES, type RecStatus } from '@/lib/calibration'
import { isMissingRecDecisions, REC_DECISIONS_TABLE } from '@/lib/rec-decisions'

// Lives in lib/actions/ rather than beside a page, since WP9: it is rendered
// on the parked Market page AND on the legacy Dashboard's hero, and an action
// imported by module path from app/dashboard/<page>/actions moves house every
// time its page does — which is exactly what happened here.
//
// Moving a recommendation through its lifecycle — the write the `status`
// column has been granted for since 2026-08-18 and never received.
//
// No role check, deliberately. Settings writes are owner/admin because they
// move cost and quality knobs; this is a member saying "we did this one", which
// is the whole point of the 2026-08-18 grant ("a tenant member may only move a
// recommendation through its lifecycle"). The session client + RLS + the
// column-level grant are the gate: even a crafted POST reaches exactly one
// column on exactly one tenant's rows.
//
// TWO WRITES, IN THIS ORDER (2026-09-15). `rec_decisions` is the record and
// `recommendations.status` is the copy the page reads. The ledger goes first
// because it is the one that has to survive: the row the client clicked is
// deleted and reinserted by the next update, and the status only travels with
// it when the lineage matcher re-finds it. If the ledger insert lands and the
// column write fails, the client is told it did not save and the decision is
// still applied on their next update — the honest direction to fail in. The
// other way round would look saved and be gone by Sunday.

export interface RecStatusState {
  ok: boolean
  message: string
}

/** THE RAW POSTGREST TEXT NEVER REACHES THE BROWSER. These three sites returned
 *  `Could not save: ${error.message}` — constraint names, table names and
 *  "violates row-level security policy for table …" in front of a client.
 *  lib/subjects/moves.ts's `couldNotSave` is the calibrated pattern that fixed
 *  the same thing across ten sites in WP12: log the raw text with the operation
 *  named, return a sentence. */
function couldNotSave(where: string, error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? String(error)
  console.error(`[rec-status] ${where} failed: ${message}`)
  return 'Could not save. Try again, and tell us if it keeps happening.'
}

export async function setRecommendationStatus(id: string, status: string): Promise<RecStatusState> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: 'Unknown recommendation.' }
  if (!(REC_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: 'Unknown status.' }
  }
  const { supabase, clientId, userId } = await getSessionContext()

  // The lineage and the update it belongs to, read through the same client the
  // write goes through: a foreign or deleted id resolves to nothing here rather
  // than reaching either write.
  const { data: rec, error: readError } = await supabase
    .from('recommendations')
    .select('id, run_id, lineage_id')
    .eq('id', id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (readError) return { ok: false, message: couldNotSave('setRecStatus read', readError) }
  if (!rec) return { ok: false, message: 'That recommendation is no longer here.' }

  // `lineage_id ?? id`: the 111 rows that predate the lineage column are
  // backfilled to their own id by 20260915093000_rec_decisions.sql, and a row
  // whose lineage write failed gets the same reading the matcher gives it
  // (`prior.lineage_id ?? prior.id`).
  //
  // `decided_by` is the real person even inside the workspace switcher, where
  // `supabase` is the SERVICE-ROLE client (lib/auth.ts applyOperatorView) and
  // the database can see nobody at all. On a tenant's own session the insert
  // policy pins it to auth.uid() as well, so one member cannot file a decision
  // under another's name.
  const { error: decisionError } = await supabase.from(REC_DECISIONS_TABLE).insert({
    client_id: clientId,
    lineage_id: (rec.lineage_id as string | null) ?? (rec.id as string),
    recommendation_id: rec.id as string,
    run_id: rec.run_id as string | null,
    status: status as RecStatus,
    decided_by: userId,
    note: null,
  })
  if (decisionError) {
    // The one failure worth continuing past: a deploy that landed before
    // 20260915093000_rec_decisions.sql. Without this the control would be dead
    // in front of the client for a table that arrives on Thursday — so the
    // status is written the way it was written before the ledger existed, and
    // the warning says what that costs.
    if (!isMissingRecDecisions(decisionError)) {
      return { ok: false, message: couldNotSave('setRecStatus decision', decisionError) }
    }
    console.warn(
      '[rec-status] rec_decisions does not exist; apply supabase/migrations/20260915093000_rec_decisions.sql. ' +
      'Recording the status on the recommendation alone; it now survives only as long as the next update re-finds this row.',
    )
  }

  // `status` and nothing else. `updated_at` is on the table, but the grant that
  // has existed since 2026-08-18 covers `status` alone — writing both 403s on
  // today's database, and this action has to work on the schema that is
  // deployed, not the one the migration will bring. (`rec_decisions.decided_at`
  // is where "when" lives now, and the client cannot write that either.)
  //
  // client_id is re-asserted as well as enforced by RLS: belt and braces on the
  // one table where a tenant can write at all.
  const { data, error } = await supabase
    .from('recommendations')
    .update({ status: status as RecStatus })
    .eq('id', id)
    .eq('client_id', clientId)
    .select('id')

  if (error) {
    // 'in_progress' joins the CHECK with 20260911140000_initiatives.sql. Until
    // that lands the database refuses it, and the reader deserves a sentence
    // rather than a constraint name.
    if (status === 'in_progress' && (error as { code?: string }).code === '23514') {
      return { ok: false, message: '“Working on it” isn’t available yet. Mark it Acknowledged for now.' }
    }
    return { ok: false, message: couldNotSave('setRecStatus update', error) }
  }
  // An update that matched nothing is not a save. (A foreign or deleted id
  // reaches here as success with zero rows — RLS filters, it does not error.)
  if ((data ?? []).length === 0) return { ok: false, message: 'That recommendation is no longer here.' }

  // Both surfaces show it: the agenda list and the dashboard's top-
  // recommendation tile. THREE paths while the old and the new Market coexist
  // (WP9): the control is rendered on the parked page at /dashboard/market-intel
  // AND the new Market takes /dashboard/market and reads the same ledger, so
  // revalidating one address would leave a client who marked a recommendation
  // "Working on it" looking at a stale answer on the other for a router-cache
  // minute (next.config.ts staleTimes.dynamic = 60). The parked path drops out
  // with the parked page.
  revalidatePath('/dashboard/market-intel')
  revalidatePath('/dashboard/market')
  revalidatePath('/dashboard')
  return { ok: true, message: '' }
}
