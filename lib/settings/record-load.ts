import type { SupabaseClient } from '@supabase/supabase-js'

import { CONFIG_CHANGES_TABLE, isMissingConfigLog, type ConfigChange } from '../config-log'
import { GATE_APPEALS_TABLE, isMissingGateAppeals, type GateAccess } from '../gate-record'
import { isMissingAffects } from './change-log'
import { isMissingBookkeepingColumn } from '../pipeline/run-bookkeeping'
import { loadRecordInputs, type RecordInputs, type RecordWindow } from '../reading/record'
import type { UpdateInput } from '../readiness/types'
import { selectAll } from '../supabase-admin'
import { REJECT_ROWS, appealKey, type GateVerdict, type RejectRow } from './reject-log'

/**
 * The reads behind Settings › The record (Phase 1 WP16, design ST5–ST8).
 *
 * TWO CLIENTS, AND THE SPLIT IS THE COLUMN GRANT'S. Everything a member may
 * see is read on `session.supabase` — the tenant's own client under RLS, and
 * already the service-role client for an operator viewing this workspace. The
 * twenty discarded candidates WITH their caption excerpt are read on the admin
 * client, only after the caller has checked `canManageTenant`, because M8
 * deliberately withholds `caption_excerpt`, `account_name` and `reason` from
 * `authenticated`: a row-level policy keys on client_id and never on role, and
 * Össur has three members who never open this page.
 *
 * NOTHING HERE TURNS A MISSING MIGRATION INTO A ZERO. `config_changes` and the
 * gate tables each land in their own window, and a record that says "17 changes"
 * because a table is absent is worse than one that says the record has not
 * started. Every group that can be absent carries an `available` flag and the
 * page prints the difference. That is the readiness module's rule, applied to
 * the surface that reads the same tables.
 *
 * WHY `gate_appeals` IS THE PROBE FOR THE WHOLE GATE HALF. Before M8,
 * `gate_verdicts` is `is_superadmin()`-only — and RLS FILTERS, it does not
 * error, so a member's read comes back as zero rows with no error at all and
 * is indistinguishable from "nothing was ever judged". There is nothing in that
 * answer to detect. `gate_appeals` is created by the same migration and does
 * not exist before it, and a GET on a table PostgREST has never heard of
 * returns PGRST205 with the table named. So the absence of the appeals table is
 * what tells the page that the verdict counts it is about to read cannot be
 * trusted, and the panel says so instead of printing a confident nothing.
 */

// The probe and the two regimes it distinguishes now live in lib/gate-record.ts:
// THREE modules read this table on a client whose access depends on who is
// asking — this loader, lib/reading/record.ts (the coverage block) and
// lib/readiness/load.ts (row 8) — and a probe defined in one page's loader is a
// probe the other two do not run. Re-exported because the appeal action and the
// tracking loader import it from here.
export { GATE_APPEALS_TABLE, isMissingGateAppeals }

export interface GateHalf {
  /** False until M8 is applied. Every number below is then meaningless and the
   *  page must not print one. */
  available: boolean
  verdicts: GateVerdict[]
  /** The twenty rows with their excerpt — only for an owner or an admin, and
   *  empty for everyone else. */
  rows: RejectRow[]
  /** Keys already appealed, so a filed complaint does not offer its button
   *  again. */
  appealed: Set<string>
}

export interface RecordPageInputs {
  tenant: string
  window: RecordWindow
  updates: UpdateInput[]
  slotsRecorded: boolean
  changes: { available: boolean; rows: ConfigChange[] }
  emails: Record<string, string>
  gate: GateHalf
  coverage: RecordInputs
}

const empty: GateHalf = { available: false, verdicts: [], rows: [], appealed: new Set() }

async function loadUpdates(client: SupabaseClient, clientId: string): Promise<{ updates: UpdateInput[]; slotsRecorded: boolean }> {
  // The bookkeeping columns land in their own migration; probe once rather
  // than letting a wide read fail on a column nobody asked about.
  const probe = await client.from('pipeline_runs').select('scheduled_for, stalled').limit(1)
  const slotsRecorded = !isMissingBookkeepingColumn(probe.error)
  if (probe.error && !isMissingBookkeepingColumn(probe.error)) throw probe.error

  type Row = { id: string; status: string; started_at: string; completed_at: string | null; scheduled_for?: string | null; stalled?: boolean | null }
  const rows = await selectAll<Row>(() => {
    const table = client.from('pipeline_runs')
    const q = slotsRecorded
      ? table.select('id, status, started_at, completed_at, scheduled_for, stalled')
      : table.select('id, status, started_at, completed_at')
    return q.eq('client_id', clientId).order('started_at', { ascending: false }).order('id', { ascending: false })
  })
  return {
    slotsRecorded,
    updates: rows.map((r) => ({
      id: r.id, status: r.status, startedAt: r.started_at, completedAt: r.completed_at,
      scheduledFor: r.scheduled_for ?? null, stalled: r.stalled ?? null,
    })),
  }
}

async function loadChanges(client: SupabaseClient, clientId: string): Promise<{ available: boolean; rows: ConfigChange[] }> {
  const probe = await client.from(CONFIG_CHANGES_TABLE).select('id').limit(1)
  if (isMissingConfigLog(probe.error)) return { available: false, rows: [] }
  if (probe.error) throw probe.error
  // Both column lists are written out, not built: the client's own types read
  // the select string, and a variable there types every row as a parser error
  // (the rule lib/readiness/load.ts already states).
  try {
    return {
      available: true,
      rows: await selectAll<ConfigChange>(() =>
        client.from(CONFIG_CHANGES_TABLE)
          .select('id, client_id, changed_at, surface, field, before, after, actor_kind, actor_user_id, actor_label, run_id, source, rows_affected, note, affects_audiences, affects_months')
          .eq('client_id', clientId)
          .order('changed_at', { ascending: false })
          .order('id', { ascending: false }),
      ),
    }
  } catch (error) {
    if (!isMissingAffects(error)) throw error
    const rows = await selectAll<Omit<ConfigChange, 'affects_audiences' | 'affects_months'>>(() =>
      client.from(CONFIG_CHANGES_TABLE)
        .select('id, client_id, changed_at, surface, field, before, after, actor_kind, actor_user_id, actor_label, run_id, source, rows_affected, note')
        .eq('client_id', clientId)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false }),
    )
    return {
      available: true,
      rows: rows.map((r) => ({ ...r, affects_audiences: null, affects_months: null })),
    }
  }
}

async function loadGate(
  client: SupabaseClient,
  admin: SupabaseClient | null,
  clientId: string,
): Promise<GateHalf> {
  const probe = await client.from(GATE_APPEALS_TABLE).select('id').limit(1)
  if (isMissingGateAppeals(probe.error)) return empty
  if (probe.error) throw probe.error

  // The counts every member may see: nine granted columns, no text.
  const verdicts = await selectAll<{ platform: string; keyword: string | null; kept: boolean; source: string; created_at: string }>(() =>
    client.from('gate_verdicts')
      .select('platform, keyword, kept, source, created_at')
      .eq('client_id', clientId)
      .order('id', { ascending: false }),
  )

  const appealRows = await selectAll<{ run_id: string | null; platform: string; video_id: string }>(() =>
    client.from(GATE_APPEALS_TABLE).select('run_id, platform, video_id').eq('client_id', clientId),
  )
  const appealed = new Set(appealRows.map((a) => appealKey({ runId: a.run_id, platform: a.platform, videoId: a.video_id })))

  // The excerpt half. Bounded at twenty and never paginated: this is a sample
  // of the judgement, not a second corpus.
  let rows: RejectRow[] = []
  if (admin) {
    const { data, error } = await admin
      .from('gate_verdicts')
      .select('run_id, platform, video_id, account_name, caption_excerpt, keyword, reason, source, created_at')
      .eq('client_id', clientId)
      .eq('kept', false)
      .order('id', { ascending: false })
      .limit(REJECT_ROWS)
    if (error) throw error
    rows = (data ?? []).map((r) => ({
      runId: r.run_id, platform: r.platform, videoId: r.video_id,
      accountName: r.account_name, captionExcerpt: r.caption_excerpt, keyword: r.keyword,
      reason: r.reason, source: r.source, createdAt: r.created_at,
      appealed: appealed.has(appealKey({ runId: r.run_id, platform: r.platform, videoId: r.video_id })),
    }))
  }

  return {
    available: true,
    verdicts: verdicts.map((v) => ({
      platform: v.platform, keyword: v.keyword, kept: v.kept, source: v.source, createdAt: v.created_at,
    })),
    rows,
    appealed,
  }
}

/** Who made each change, resolved to an address. The change log stores a user
 *  id; an unresolved one prints as "someone on your team" rather than as a
 *  uuid, so a failed read here costs a name and never a page. */
async function loadEmails(client: SupabaseClient, clientId: string): Promise<Record<string, string>> {
  const { data, error } = await client.from('users').select('id, email').eq('client_id', clientId)
  if (error) return {}
  return Object.fromEntries((data ?? []).filter((u) => u.email).map((u) => [u.id as string, u.email as string]))
}

export async function loadRecordPage(args: {
  client: SupabaseClient
  /** Non-null only when the caller has checked canManageTenant. */
  admin: SupabaseClient | null
  clientId: string
  tenant: string
  window: RecordWindow
  now?: string
  /** Which regime `client` is in (lib/gate-record.ts gateAccessFor). The
   *  coverage block reads `gate_verdicts` through the reading layer, and
   *  without this it prints "not recorded at all" to a workspace with 1,700
   *  verdicts. */
  gate?: GateAccess
}): Promise<RecordPageInputs> {
  const { client, admin, clientId, tenant, window } = args
  const [updates, changes, emails, gate, coverage] = await Promise.all([
    loadUpdates(client, clientId),
    loadChanges(client, clientId),
    loadEmails(client, clientId),
    loadGate(client, admin, clientId),
    loadRecordInputs(client, clientId, window, { now: args.now, gate: args.gate ?? 'tenant' }),
  ])
  return {
    tenant,
    window,
    updates: updates.updates,
    slotsRecorded: updates.slotsRecorded,
    changes,
    emails,
    gate,
    coverage,
  }
}
