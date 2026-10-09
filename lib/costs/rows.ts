import type { BillFields, PlanFields, SettingsFields } from './forms'
import {
  DEFAULT_SETTINGS,
  type Bill, type BillCadence, type BillStatus, type ClientPlan, type CostSettings, type Currency,
  type PerRun, type RunCadence, type Stage,
} from './types'

// The Costs tables' rows, between the database's snake_case and the page's
// types. PostgREST returns `numeric` as a number or a string depending on its
// size, so every figure goes through `num`. Pure.

type Row = Record<string, unknown>

const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v))
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const day = (v: unknown): string | null => (v === null || v === undefined ? null : String(v).slice(0, 10))

export function billFromRow(r: Row): Bill {
  return {
    id: String(r.id),
    slug: str(r.slug),
    name: String(r.name ?? ''),
    what: str(r.what),
    category: str(r.category),
    amount: numOrNull(r.amount),
    currency: (r.currency as Currency) ?? 'USD',
    cadence: (r.cadence as BillCadence) ?? 'monthly',
    nextChargeOn: day(r.next_charge_on),
    anchorDay: numOrNull(r.anchor_day),
    status: (r.status as BillStatus) ?? 'active',
    overdueAmount: num(r.overdue_amount),
    paymentMethod: str(r.payment_method),
    notes: str(r.notes),
    isEstimate: Boolean(r.is_estimate),
    shared: Boolean(r.shared),
    usageTracked: Boolean(r.usage_tracked),
    manageUrl: str(r.manage_url),
    lastPaidOn: day(r.last_paid_on),
  }
}

export function billToRow(b: BillFields): Row {
  return {
    name: b.name,
    what: b.what,
    category: b.category,
    amount: b.amount,
    currency: b.currency,
    cadence: b.cadence,
    next_charge_on: b.nextChargeOn,
    anchor_day: b.anchorDay,
    status: b.status,
    overdue_amount: b.overdueAmount,
    payment_method: b.paymentMethod,
    notes: b.notes,
    is_estimate: b.isEstimate,
    shared: b.shared,
    usage_tracked: b.usageTracked,
    manage_url: b.manageUrl,
  }
}

export function planFromRow(r: Row): ClientPlan {
  return {
    id: String(r.id),
    clientId: str(r.client_id),
    name: str(r.name),
    stage: (r.stage as Stage) ?? 'paying',
    price: num(r.price),
    currency: (r.currency as Currency) ?? 'USD',
    unpaidAmount: num(r.unpaid_amount),
    note: str(r.note),
    trialEndsOn: day(r.trial_ends_on),
    cadence: (r.cadence as RunCadence | null) ?? null,
    costPerRunUsd: numOrNull(r.cost_per_run_usd),
  }
}

export function planToRow(p: PlanFields): Row {
  return {
    name: p.name,
    stage: p.stage,
    price: p.price,
    currency: p.currency,
    unpaid_amount: p.unpaidAmount,
    note: p.note,
    trial_ends_on: p.trialEndsOn,
    cadence: p.cadence,
    cost_per_run_usd: p.costPerRunUsd,
  }
}

/** The settings row; a missing row reads as the migration's defaults. */
export function settingsFromRow(r: Row | null | undefined): CostSettings {
  if (!r) return DEFAULT_SETTINGS
  return {
    usdZar: num(r.usd_zar) || DEFAULT_SETTINGS.usdZar,
    eurZar: num(r.eur_zar) || DEFAULT_SETTINGS.eurZar,
    extraOpenaiUsd: num(r.extra_openai_usd),
    extraApifyUsd: num(r.extra_apify_usd),
    apifyPlanUsd: num(r.apify_plan_usd),
    apifyCapUsd: num(r.apify_cap_usd),
    apifyCycleDay: num(r.apify_cycle_day) || DEFAULT_SETTINGS.apifyCycleDay,
    openaiBalanceUsd: numOrNull(r.openai_balance_usd),
    openaiBalanceOn: day(r.openai_balance_on),
    countShared: r.count_shared === undefined ? DEFAULT_SETTINGS.countShared : Boolean(r.count_shared),
    countProspects: Boolean(r.count_prospects),
  }
}

export function settingsToRow(s: SettingsFields): Row {
  return {
    usd_zar: s.usdZar,
    eur_zar: s.eurZar,
    extra_openai_usd: s.extraOpenaiUsd,
    extra_apify_usd: s.extraApifyUsd,
    apify_plan_usd: s.apifyPlanUsd,
    apify_cap_usd: s.apifyCapUsd,
    apify_cycle_day: s.apifyCycleDay,
    openai_balance_usd: s.openaiBalanceUsd,
    openai_balance_on: s.openaiBalanceOn,
    count_shared: s.countShared,
    count_prospects: s.countProspects,
  }
}

/** A `cost_per_run_by_client` row, as the forecast reads it. */
export function perRunFromRow(r: Row): { clientId: string; runs: number; perRun: PerRun; lastRunAt: string | null } {
  return {
    clientId: String(r.client_id),
    runs: num(r.runs),
    perRun: { openai: num(r.openai_usd), transcripts: num(r.transcribe_usd), apify: num(r.apify_usd) },
    lastRunAt: str(r.last_run_at),
  }
}
