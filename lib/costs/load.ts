import type { createAdminClient } from '@/lib/supabase-admin'
import { billingCycle, jhbDayStart, todayJhb, type Cycle } from './dates'
import { billFromRow, perRunFromRow, planFromRow, settingsFromRow } from './rows'
import type { Bill, ClientPlan, CostSettings, PerRun } from './types'
import { usageFromRow, type UsageRow } from './usage'

// Everything the Costs page reads, in two waves of small reads through the
// service role (the tables refuse every other session). The caller has
// already checked costsAdmin(). I/O glue only: every figure is decided by the
// pure modules beside this one.
//
// NO READ HERE CAN MEET THE 1000-ROW CAP (AGENTS.md): the three cost tables
// and the clients hold tens of rows, and the four functions aggregate in SQL
// and return tens (six months × three vendors × the clients; fifteen runs).

type Admin = ReturnType<typeof createAdminClient>

export interface ClientInfo {
  id: string
  name: string
  isActive: boolean
  /** clients.trial_ends_at as a day, where the app has one. */
  trialEndsAt: string | null
  /** tracking_configs.report_period. */
  reportPeriod: string | null
}

export interface RecentRun {
  runId: string
  clientName: string | null
  startedAt: string
  status: string
  openaiUsd: number
  transcribeUsd: number
  apifyUsd: number | null
  totalUsd: number
  apifyAttribution: string | null
}

export interface MeasuredRun {
  clientId: string
  runs: number
  perRun: PerRun
  lastRunAt: string | null
}

export interface CostsData {
  today: string
  bills: Bill[]
  plans: ClientPlan[]
  settings: CostSettings
  clients: ClientInfo[]
  measured: MeasuredRun[]
  usage: UsageRow[]
  recentRuns: RecentRun[]
  apifyCycle: Cycle
  /** Apify spend recorded since the cycle began. */
  apifyCycleSpendUsd: number
  /** OpenAI spend logged since the balance day began (every call, transcripts
   *  included), or null with no balance entered. */
  openaiSinceBalanceUsd: number | null
}

/** The migration has not been applied: the page says so instead of failing. */
export class CostsTablesMissing extends Error {}

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST202', '42883'])

function check<T>(label: string, res: { data: T | null; error: { code?: string; message?: string } | null }): T {
  if (res.error) {
    if (res.error.code && MISSING.has(res.error.code)) throw new CostsTablesMissing(label)
    throw new Error(`costs: ${label}: ${res.error.message ?? res.error.code}`)
  }
  return res.data as T
}

type Row = Record<string, unknown>

export async function loadCosts(admin: Admin, now: Date): Promise<CostsData> {
  const today = todayJhb(now)

  const [billsRes, plansRes, settingsRes, clientsRes, configsRes, perRunRes, usageRes, runsRes] = await Promise.all([
    admin.from('cost_bills').select('*').order('name'),
    admin.from('cost_client_plans').select('*').order('created_at'),
    admin.from('cost_settings').select('*').eq('id', true).maybeSingle(),
    admin.from('clients').select('id, company_name, is_active, trial_ends_at').order('company_name'),
    admin.from('tracking_configs').select('client_id, report_period'),
    admin.rpc('cost_per_run_by_client', { p_runs: 3 }),
    admin.rpc('cost_usage_by_month', { p_months: 6 }),
    admin.rpc('cost_recent_runs', { p_limit: 15 }),
  ])

  const bills = check<Row[]>('cost_bills', billsRes).map(billFromRow)
  const plans = check<Row[]>('cost_client_plans', plansRes).map(planFromRow)
  const settings = settingsFromRow(check<Row | null>('cost_settings', settingsRes))
  const periods = new Map(
    check<Row[]>('tracking_configs', configsRes).map((r) => [String(r.client_id), r.report_period == null ? null : String(r.report_period)]),
  )
  const clients = check<Row[]>('clients', clientsRes).map((r): ClientInfo => ({
    id: String(r.id),
    name: String(r.company_name ?? ''),
    isActive: Boolean(r.is_active),
    trialEndsAt: r.trial_ends_at == null ? null : String(r.trial_ends_at).slice(0, 10),
    reportPeriod: periods.get(String(r.id)) ?? null,
  }))
  const measured = check<Row[]>('cost_per_run_by_client', perRunRes).map(perRunFromRow)
  const usage = check<Row[]>('cost_usage_by_month', usageRes).flatMap((r) => usageFromRow(r) ?? [])
  const recentRuns = check<Row[]>('cost_recent_runs', runsRes).map((r): RecentRun => ({
    runId: String(r.run_id),
    clientName: r.client_name == null ? null : String(r.client_name),
    startedAt: String(r.started_at),
    status: String(r.status ?? ''),
    openaiUsd: Number(r.openai_usd ?? 0),
    transcribeUsd: Number(r.transcribe_usd ?? 0),
    apifyUsd: r.apify_usd == null ? null : Number(r.apify_usd),
    totalUsd: Number(r.total_usd ?? 0),
    apifyAttribution: r.apify_attribution == null ? null : String(r.apify_attribution),
  }))

  // Second wave: two windows that depend on the settings row.
  const apifyCycle = billingCycle(today, settings.apifyCycleDay)
  const spend = (from: string) => admin.rpc('cost_spend_between', { p_from: jhbDayStart(from), p_to: now.toISOString() })
  const [cycleRes, balanceRes] = await Promise.all([
    spend(apifyCycle.start),
    settings.openaiBalanceOn ? spend(settings.openaiBalanceOn) : Promise.resolve(null),
  ])
  const byVendor = (rows: Row[]) => new Map(rows.map((r) => [String(r.vendor), Number(r.usd ?? 0)]))
  const cycle = byVendor(check<Row[]>('cost_spend_between', cycleRes))
  const balance = balanceRes ? byVendor(check<Row[]>('cost_spend_between', balanceRes)) : null

  return {
    today,
    bills,
    plans,
    settings,
    clients,
    measured,
    usage,
    recentRuns,
    apifyCycle,
    apifyCycleSpendUsd: cycle.get('apify') ?? 0,
    // What draws on the prepaid credit: every logged call, transcripts
    // included. A transcript row's cost is OpenAI tokens on both paths
    // (whisper-1, and the speech actor's content check); the actor's own
    // spend is in apify_runs (lib/gather/transcript-backfill.ts).
    openaiSinceBalanceUsd: balance ? (balance.get('openai') ?? 0) + (balance.get('transcripts') ?? 0) : null,
  }
}
