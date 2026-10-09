// The Costs page's vocabulary (operator only, /dashboard/ops/costs).
//
// Every enum here mirrors a CHECK in supabase/migrations/20261108090000_costs.sql,
// so a value the form accepts is one the database accepts. Pure: no I/O.

export const CURRENCIES = ['USD', 'ZAR', 'EUR'] as const
export type Currency = (typeof CURRENCIES)[number]

/** How often a bill charges. `usage` is pay-as-you-go: its amount is a
 *  typical month's spend, not a price. */
export const BILL_CADENCES = ['monthly', 'yearly', 'two_yearly', 'usage'] as const
export type BillCadence = (typeof BILL_CADENCES)[number]

export const BILL_STATUSES = ['active', 'watch', 'failing', 'paused', 'ended'] as const
export type BillStatus = (typeof BILL_STATUSES)[number]

/** How often a client's update runs. Every 2 weeks is `fortnightly`. */
export const RUN_CADENCES = ['weekly', 'fortnightly', 'monthly', 'none'] as const
export type RunCadence = (typeof RUN_CADENCES)[number]

export const STAGES = ['paying', 'trial', 'prospect'] as const
export type Stage = (typeof STAGES)[number]

export const BILL_CADENCE_LABEL: Record<BillCadence, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  two_yearly: 'Every 2 years',
  usage: 'Usage-based',
}

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  active: 'Active',
  watch: 'Watch',
  failing: 'Payment failing',
  paused: 'Paused',
  ended: 'Ended',
}

export const RUN_CADENCE_LABEL: Record<RunCadence, string> = {
  weekly: 'Weekly',
  fortnightly: 'Every 2 weeks',
  monthly: 'Monthly',
  none: 'No runs',
}

export const STAGE_LABEL: Record<Stage, string> = {
  paying: 'Paying',
  trial: 'Trial',
  prospect: 'Prospect',
}

/** One row of `cost_bills`, as the page holds it. Dates are 'YYYY-MM-DD'. */
export interface Bill {
  id: string
  slug: string | null
  name: string
  what: string | null
  category: string | null
  /** Null = not known yet. */
  amount: number | null
  currency: Currency
  cadence: BillCadence
  nextChargeOn: string | null
  /** The day of the month it charges on (31 while a short month shows the
   *  30th); null = the day of nextChargeOn. */
  anchorDay: number | null
  status: BillStatus
  overdueAmount: number
  paymentMethod: string | null
  notes: string | null
  isEstimate: boolean
  shared: boolean
  usageTracked: boolean
  manageUrl: string | null
  lastPaidOn: string | null
}

/** The one `cost_settings` row. */
export interface CostSettings {
  usdZar: number
  eurZar: number
  extraOpenaiUsd: number
  extraApifyUsd: number
  apifyPlanUsd: number
  apifyCapUsd: number
  apifyCycleDay: number
  openaiBalanceUsd: number | null
  openaiBalanceOn: string | null
  countShared: boolean
  countProspects: boolean
}

/** The migration's column defaults: what the page assumes before the row is
 *  read, and what a missing row reads as. */
export const DEFAULT_SETTINGS: CostSettings = {
  usdZar: 16.62,
  eurZar: 18.63,
  extraOpenaiUsd: 17,
  extraApifyUsd: 7.5,
  apifyPlanUsd: 29,
  apifyCapUsd: 200,
  apifyCycleDay: 9,
  openaiBalanceUsd: null,
  openaiBalanceOn: null,
  countShared: true,
  countProspects: false,
}

/** One row of `cost_client_plans`. A prospect has no clientId. */
export interface ClientPlan {
  id: string
  clientId: string | null
  name: string | null
  stage: Stage
  price: number
  currency: Currency
  unpaidAmount: number
  note: string | null
  trialEndsOn: string | null
  /** Null = follow the client's schedule (tracking_configs.report_period). */
  cadence: RunCadence | null
  /** Null = the measured average of the last three full runs. */
  costPerRunUsd: number | null
}

/** A run's cost split by vendor, in dollars. */
export interface PerRun {
  openai: number
  transcripts: number
  apify: number
}
