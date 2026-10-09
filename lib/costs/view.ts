import { upcomingCharges, type Charge } from './dates'
import {
  apifyPace, cadenceFromSchedule, fixedCosts, forecast, openaiRunway, owedByYouZar, owedToYouZar,
  type FixedLine, type Forecast, type Pace, type Runway,
} from './forecast'
import type { CostsData, MeasuredRun } from './load'
import type { Currency, RunCadence, Stage } from './types'
import { monthAxis, pivot, type Pivot } from './usage'

// The Costs page, decided: the loaded rows in, every figure the page prints
// out. Pure (lib/costs/view.test.ts), so the page component only lays it out.

export interface PlanView {
  /** The plan row's id, or `client:<id>` for a client with no row yet. */
  key: string
  planId: string | null
  clientId: string | null
  name: string
  stage: Stage
  price: number
  currency: Currency
  unpaidAmount: number
  note: string | null
  trialEndsOn: string | null
  /** Where the trial date came from: this page, or the app's own column. */
  trialSource: 'plan' | 'app' | null
  cadence: RunCadence
  /** `plan`: set on this page. `schedule`: the client's own schedule. */
  cadenceSource: 'plan' | 'schedule'
  /** What the schedule says, for a client (null for a prospect). */
  scheduleCadence: RunCadence | null
  /** The typed override, or null for the measured average. */
  overrideUsd: number | null
  measured: MeasuredRun | null
}

export interface CostsView {
  plans: PlanView[]
  fixed: { lines: FixedLine[]; totalZar: number }
  forecast: Forecast
  upcoming: Charge[]
  runway: Runway
  /** What the forecast expects OpenAI's credit to burn in a month. */
  openaiMonthlyBurnUsd: number
  pace: Pace
  /** What the forecast expects Apify usage to be in a cycle. */
  apifyPlannedUsd: number
  owedToYouZar: number
  owedByYouZar: number
  usageByVendor: Pivot
  usageByClient: Pivot
}

/**
 * Every client with a plan row or still active, then the prospects. A client
 * with no row is planned from what the app knows: on trial while
 * `clients.trial_ends_at` is ahead, else paying, at no price until one is set.
 */
export function planViews(data: Pick<CostsData, 'clients' | 'plans' | 'measured' | 'today'>): PlanView[] {
  const measured = new Map(data.measured.map((m) => [m.clientId, m]))
  const out: PlanView[] = []
  for (const c of data.clients) {
    const plan = data.plans.find((p) => p.clientId === c.id) ?? null
    if (!plan && !c.isActive) continue
    const scheduleCadence = cadenceFromSchedule(c.reportPeriod)
    const trialEndsOn = plan?.trialEndsOn ?? c.trialEndsAt
    out.push({
      key: plan?.id ?? `client:${c.id}`,
      planId: plan?.id ?? null,
      clientId: c.id,
      name: c.name,
      stage: plan?.stage ?? (c.trialEndsAt && c.trialEndsAt >= data.today ? 'trial' : 'paying'),
      price: plan?.price ?? 0,
      currency: plan?.currency ?? 'USD',
      unpaidAmount: plan?.unpaidAmount ?? 0,
      note: plan?.note ?? null,
      trialEndsOn,
      trialSource: plan?.trialEndsOn ? 'plan' : c.trialEndsAt ? 'app' : null,
      cadence: plan?.cadence ?? scheduleCadence,
      cadenceSource: plan?.cadence ? 'plan' : 'schedule',
      scheduleCadence,
      overrideUsd: plan?.costPerRunUsd ?? null,
      measured: measured.get(c.id) ?? null,
    })
  }
  for (const p of data.plans) {
    if (p.clientId !== null) continue
    out.push({
      key: p.id,
      planId: p.id,
      clientId: null,
      name: p.name ?? 'Prospect',
      stage: 'prospect',
      price: p.price,
      currency: p.currency,
      unpaidAmount: p.unpaidAmount,
      note: p.note,
      trialEndsOn: null,
      trialSource: null,
      cadence: p.cadence ?? 'none',
      cadenceSource: 'plan',
      scheduleCadence: null,
      overrideUsd: p.costPerRunUsd,
      measured: null,
    })
  }
  return out
}

export function buildCostsView(data: CostsData): CostsView {
  const plans = planViews(data)
  const fixed = fixedCosts(data.bills, data.settings)
  const f = forecast(
    plans.map((p) => ({
      key: p.key,
      name: p.name,
      stage: p.stage,
      price: p.price,
      currency: p.currency,
      cadence: p.cadence,
      measured: p.measured?.perRun ?? null,
      overrideUsd: p.overrideUsd,
    })),
    fixed.totalZar,
    data.settings,
  )
  // The credit burns on today's clients: OpenAI's calls and transcripts (all
  // OpenAI tokens), extras included.
  const openaiMonthlyBurnUsd = f.now.openaiUsd + f.now.transcriptsUsd
  const months = monthAxis(data.today, 6)
  return {
    plans,
    fixed,
    forecast: f,
    upcoming: upcomingCharges(data.bills, data.today, 60),
    runway: openaiRunway({
      balanceUsd: data.settings.openaiBalanceUsd,
      balanceOn: data.settings.openaiBalanceOn,
      today: data.today,
      trackedSinceUsd: data.openaiSinceBalanceUsd ?? 0,
      monthlyBurnUsd: openaiMonthlyBurnUsd,
      extraMonthlyUsd: data.settings.extraOpenaiUsd,
    }),
    openaiMonthlyBurnUsd,
    pace: apifyPace(data.apifyCycleSpendUsd, data.apifyCycle, data.settings.apifyCapUsd, data.today),
    apifyPlannedUsd: f.now.apifyUsageUsd,
    // A prospect is not a client yet, so it owes nothing.
    owedToYouZar: owedToYouZar(plans.filter((p) => p.stage !== 'prospect'), data.settings),
    owedByYouZar: owedByYouZar(data.bills, data.settings),
    usageByVendor: pivot(data.usage, months, 'vendor'),
    usageByClient: pivot(data.usage, months, 'client'),
  }
}
