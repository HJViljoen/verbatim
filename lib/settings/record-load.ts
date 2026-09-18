import type { SupabaseClient } from '@supabase/supabase-js'

import { CONFIG_CHANGES_TABLE, isMissingConfigLog, type ConfigChange } from '../config-log'
import { GATE_APPEALS_TABLE, isMissingGateAppeals, type GateAccess } from '../gate-record'
import { isMissingAffects } from './change-log'
import { isMissingBookkeepingColumn } from '../pipeline/run-bookkeeping'
import { loadRecordInputs, type RecordInputs, type RecordWindow } from '../reading/record'
import type { UpdateInput } from '../readiness/types'
import type { RailCounts } from './rail'
import { selectAll } from '../supabase-admin'
import {
  GATE_SAMPLE, REJECT_ROWS, appealKey, gateTotalsFrom,
  type GateTotals, type GateVerdict, type RejectRow,
} from './reject-log'

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
  /** Exact, from head counts — never from the sample below. */
  totals: GateTotals
  /** The most recent `GATE_SAMPLE` judgements, for the per-term and
   *  per-platform rates. Bounded on purpose: this table grows by several
   *  hundred rows an update and the page is open to every member. */
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
  /** `available` is about the TABLE; `affectsRecorded` is about M1's two
   *  columns, which the read below falls back without. The save-state strip
   *  needs the second to tell "this save broke nothing" from "we did not write
   *  down what it broke" (lib/settings/save-state.ts `recorded`), and the
   *  fallback used to map the columns to null and say nothing about why. */
  changes: { available: boolean; affectsRecorded: boolean; rows: ConfigChange[] }
  emails: Record<string, string>
  gate: GateHalf
  coverage: RecordInputs
}

const noTotals: GateTotals = { found: 0, kept: 0, dropped: 0, keptPct: 0, unjudged: 0, firstAt: null }

const empty: GateHalf = { available: false, totals: noTotals, verdicts: [], rows: [], appealed: new Set() }

/** A head count that throws rather than hands back a null the page would print
 *  as a zero (lib/reading/record.ts's own rule, applied here). */
const headCount = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
  const { count, error } = await q
  if (error) throw new Error(`gate count: ${(error as { message?: string }).message ?? String(error)}`)
  return count ?? 0
}

/** Exported since block D (D9): the brief's method page carries the same
 *  delivery line Settings › The record prints ("23 updates since 6 Apr 2026
 *  · longest gap 35 days · last on 27 Sep 2026"), and a second reader of
 *  `pipeline_runs` would be a second answer to "how many updates have you had"
 *  — which is exactly what `deliveryRecord`'s own header forbids. */
export async function loadUpdates(client: SupabaseClient, clientId: string): Promise<{ updates: UpdateInput[]; slotsRecorded: boolean }> {
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

async function loadChanges(client: SupabaseClient, clientId: string): Promise<{ available: boolean; affectsRecorded: boolean; rows: ConfigChange[] }> {
  const probe = await client.from(CONFIG_CHANGES_TABLE).select('id').limit(1)
  if (isMissingConfigLog(probe.error)) return { available: false, affectsRecorded: false, rows: [] }
  if (probe.error) throw probe.error
  // Both column lists are written out, not built: the client's own types read
  // the select string, and a variable there types every row as a parser error
  // (the rule lib/readiness/load.ts already states).
  try {
    return {
      available: true,
      affectsRecorded: true,
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
      // THE COLUMNS ARE ABSENT, NOT EMPTY, and the difference is a sentence the
      // save-state strip prints. Mapping them to null and saying nothing about
      // why is how "this save broke nothing" comes to be printed over a save
      // whose breakage we simply never recorded.
      affectsRecorded: false,
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

  // The counts every member may see: nine granted columns, no text. The three
  // totals are COUNTS — the page prints them and nothing else derives from them
  // — and only the rates need rows, so only the rates read any.
  const count = () =>
    client.from('gate_verdicts').select('id', { count: 'exact', head: true }).eq('client_id', clientId)
  const [found, kept, unjudged, firstRead, sample] = await Promise.all([
    headCount(count()),
    headCount(count().eq('kept', true)),
    headCount(count().eq('source', 'default')),
    client.from('gate_verdicts').select('created_at').eq('client_id', clientId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    client.from('gate_verdicts')
      .select('platform, keyword, kept, source, created_at')
      .eq('client_id', clientId)
      .order('id', { ascending: false })
      .limit(GATE_SAMPLE),
  ])
  if (firstRead.error) throw firstRead.error
  if (sample.error) throw sample.error
  const verdicts = (sample.data ?? []) as { platform: string; keyword: string | null; kept: boolean; source: string; created_at: string }[]
  const totals = gateTotalsFrom({
    found, kept, unjudged,
    firstAt: (firstRead.data as { created_at?: string } | null)?.created_at ?? null,
  })

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
    totals,
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
  /**
   * The READING client, and the regime it is in.
   *
   * ONE WORKSPACE MUST NOT BE TOLD TWO THINGS ABOUT ITS OWN DISCARD. The
   * coverage block below is `loadRecordInputs`, which is also what the record
   * drawer behind "the record →" draws on Overview, Voice, Market, Competitive
   * and Subjects. Those five pass `reading.client` — the reading handle's
   * service-role client, with the tenant id taken from the session — and get
   * the discard line in full. This page used to pass `session.supabase` and
   * `gate: 'tenant'`, whose probe finds no `gate_appeals` table and returns the
   * refusal "we do not yet show it to you". Measured on production in the same
   * window: Össur read "30% of what was looked at was set aside … 97 videos
   * passed the quick check" in the drawer and the refusal here, one nav click
   * apart. One of them was false either way.
   *
   * So this page reads the coverage block the way the five surfaces do. The
   * column grant M8 makes is not undone by it: that grant is about what a
   * TENANT SESSION may select, and nothing here hands a tenant session a column
   * it is not granted — the twenty discarded candidates with their caption
   * excerpt are still read on `admin`, and still only after canManageTenant.
   */
  reading?: { client: SupabaseClient; gate: GateAccess }
}): Promise<RecordPageInputs> {
  const { client, admin, clientId, tenant, window } = args
  const coverageOn = args.reading ?? { client, gate: 'tenant' as GateAccess }
  const [updates, changes, emails, gate, coverage] = await Promise.all([
    loadUpdates(client, clientId),
    loadChanges(client, clientId),
    loadEmails(client, clientId),
    loadGate(client, admin, clientId),
    loadRecordInputs(coverageOn.client, clientId, window, { now: args.now, gate: coverageOn.gate }),
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

/**
 * The counts beside the rail's labels (`record.tabs`).
 *
 * The artboard prints five of them and this page passed none, so standing on
 * The record the rail read "The record" where the mock reads "The record · 23
 * updates" — and the count it does hold was one level in, in the content pane's
 * meta. Two cheap reads buy the other two: the tracked terms are three arrays
 * on one `tracking_configs` row, and the named subjects are a head count.
 *
 * THREE ENTRIES CARRY NONE, EACH FOR ITS OWN REASON. Readiness is refused by
 * `lib/settings/rail.ts` — the mock's "3 missing" is wrong against production
 * by 2× and the true number costs the whole thirteen-row load. "Reports and
 * recipients · 5 roles" counts a thing the product does not have: recipients
 * are addresses on `report_schedules`, not roles, and a count of addresses
 * under the word "roles" would be the artboard's claim rather than ours. Team
 * and How to read have no count in the artboard either.
 *
 * `RailCounts` is `Partial` for exactly this: a key nobody loaded prints
 * nothing, and never a zero.
 */
export async function loadRailCounts(
  client: SupabaseClient,
  clientId: string,
  updates: number,
): Promise<RailCounts> {
  // A FIGURE AND ITS UNIT, not one string (E-settings, `RailCount`): the rail
  // is 224px and a "5 schedules" that does not fit cut the LABEL, not the
  // count. The unit travels as the count's accessible name and its tooltip.
  const counts: RailCounts = { record: { value: String(updates), unit: `update${updates === 1 ? '' : 's'}` } }
  const [config, subjects] = await Promise.all([
    client.from('tracking_configs').select('brand_keywords, competitor_keywords, industry_keywords')
      .eq('client_id', clientId).maybeSingle(),
    client.from('subjects').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('status', 'active'),
  ])
  const cfg = config.data as { brand_keywords?: string[]; competitor_keywords?: string[]; industry_keywords?: string[] } | null
  if (!config.error && cfg) {
    const terms = [cfg.brand_keywords, cfg.competitor_keywords, cfg.industry_keywords]
      .reduce((n, list) => n + (list ?? []).length, 0)
    if (terms > 0) counts.tracking = { value: String(terms), unit: `term${terms === 1 ? '' : 's'}` }
  }
  // A table that is not there is not a workspace with no subjects.
  if (!subjects.error && subjects.count != null && subjects.count > 0) {
    counts.subjects = { value: String(subjects.count), unit: `subject${subjects.count === 1 ? '' : 's'}` }
  }
  return counts
}
