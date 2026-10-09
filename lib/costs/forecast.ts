import { addDays, daysBetween, type Cycle } from './dates'
import { toZar } from './money'
import type { Bill, BillCadence, CostSettings, Currency, PerRun, RunCadence, Stage } from './types'

// The Costs page's planning maths (operator only). Pure: the page loads the
// rows, these functions decide every figure, and lib/costs/forecast.test.ts
// pins them.
//
// THE MONTH. A month here is a planning month: weekly is 52 runs a year over
// twelve, a yearly bill is a twelfth, a two-yearly one a twenty-fourth.

export const DAYS_PER_MONTH = 365.25 / 12

export const RUNS_PER_MONTH: Record<RunCadence, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  none: 0,
}

/**
 * A client's rhythm as its schedule stores it (`tracking_configs.report_period`):
 * weekly or monthly as they are, and anything else no runs. 'paused' is the
 * operator's pause (lib/update-rhythm.ts); 'daily' is not a rhythm a workspace
 * may store any more. A plan that runs another way says so in its own cadence.
 */
export function cadenceFromSchedule(reportPeriod: string | null | undefined): RunCadence {
  if (reportPeriod === 'weekly') return 'weekly'
  if (reportPeriod === 'monthly') return 'monthly'
  return 'none'
}

// ---- Fixed bills -----------------------------------------------------------------

/** A bill's cost in an average month, in its own currency. A usage bill's
 *  amount is already a month's spend; an unknown amount counts as nothing. */
export function monthlyEquivalent(amount: number | null, cadence: BillCadence): number {
  const a = amount ?? 0
  if (cadence === 'yearly') return a / 12
  if (cadence === 'two_yearly') return a / 24
  return a
}

/** Whether a bill belongs in the fixed part of the forecast: it still charges,
 *  the live usage figures do not already cover it (OpenAI, Apify,
 *  AssemblyAI), and, if it is shared with the other projects, shared bills
 *  are being counted. */
export function countsAsFixed(bill: Bill, settings: Pick<CostSettings, 'countShared'>): boolean {
  if (bill.status === 'ended' || bill.status === 'paused') return false
  if (bill.usageTracked) return false
  if (bill.shared && !settings.countShared) return false
  return true
}

export interface FixedLine {
  billId: string
  name: string
  /** The bill as charged: its amount (null if not known) and cadence. */
  amount: number | null
  cadence: BillCadence
  /** A month's cost in the bill's own currency. */
  monthly: number
  currency: Currency
  monthlyZar: number
  shared: boolean
  /** The amount is not known yet; it counts as nothing. */
  unknown: boolean
}

/** The fixed bills as a month, largest first, and their total in rand. */
export function fixedCosts(bills: readonly Bill[], settings: CostSettings): { lines: FixedLine[]; totalZar: number } {
  const lines = bills
    .filter((b) => countsAsFixed(b, settings))
    .map((b): FixedLine => {
      const monthly = monthlyEquivalent(b.amount, b.cadence)
      return {
        billId: b.id,
        name: b.name,
        amount: b.amount,
        cadence: b.cadence,
        monthly,
        currency: b.currency,
        monthlyZar: toZar(monthly, b.currency, settings),
        shared: b.shared,
        unknown: b.amount === null,
      }
    })
    .sort((a, b) => b.monthlyZar - a.monthlyZar || a.name.localeCompare(b.name))
  return { lines, totalZar: lines.reduce((s, l) => s + l.monthlyZar, 0) }
}

// ---- Cost per run ----------------------------------------------------------------

export const perRunTotal = (p: PerRun): number => p.openai + p.transcripts + p.apify

/**
 * How a run's cost splits across the vendors, when only a total is known (a
 * prospect's typed cost per run). The measured clients' runs, pooled; with
 * none measured, the mix measured on 9 Oct 2026 (Össur and Sealand's last
 * three full runs: OpenAI 38%, transcripts 2%, Apify 60%).
 */
export const FALLBACK_MIX: PerRun = { openai: 0.38, transcripts: 0.02, apify: 0.6 }

export function mixOf(measured: readonly PerRun[]): PerRun {
  const sum = measured.reduce(
    (s, p) => ({ openai: s.openai + p.openai, transcripts: s.transcripts + p.transcripts, apify: s.apify + p.apify }),
    { openai: 0, transcripts: 0, apify: 0 },
  )
  const total = perRunTotal(sum)
  if (total <= 0) return FALLBACK_MIX
  return { openai: sum.openai / total, transcripts: sum.transcripts / total, apify: sum.apify / total }
}

export type PerRunSource = 'measured' | 'override' | 'none'

/** A plan's cost per run: the typed override, split by the mix, where there is
 *  one; else the measured average; else none. */
export function perRunFor(
  measured: PerRun | null,
  overrideUsd: number | null,
  mix: PerRun,
): { perRun: PerRun | null; source: PerRunSource } {
  if (overrideUsd !== null) {
    return {
      perRun: { openai: overrideUsd * mix.openai, transcripts: overrideUsd * mix.transcripts, apify: overrideUsd * mix.apify },
      source: 'override',
    }
  }
  if (measured) return { perRun: measured, source: 'measured' }
  return { perRun: null, source: 'none' }
}

// ---- The month ahead -------------------------------------------------------------

export interface PlanInput {
  key: string
  name: string
  stage: Stage
  price: number
  currency: Currency
  cadence: RunCadence
  /** The average of the last three full runs, or null with none. */
  measured: PerRun | null
  overrideUsd: number | null
}

export interface ClientLine {
  key: string
  name: string
  stage: Stage
  cadence: RunCadence
  runsPerMonth: number
  perRunUsd: number | null
  perRunSource: PerRunSource
  /** What its runs cost in a month. */
  usageUsd: number
  usageZar: number
  /** What it pays in a month, in rand. */
  revenueZar: number
  /** Revenue counted today less its runs: a trial's runs cost and it pays
   *  nothing yet. Null for a prospect, which is not a client today. */
  leftNowZar: number | null
  /** Once trials convert (and prospects sign, when they are counted). Null
   *  for a prospect left out. */
  leftPlannedZar: number | null
}

export interface Scenario {
  openaiUsd: number
  transcriptsUsd: number
  /** What the runs and the extras spend on Apify. */
  apifyUsageUsd: number
  /** What Apify bills: the usage, never less than the plan's fee. */
  apifyUsd: number
  apifyAtFloor: boolean
  usageZar: number
  fixedZar: number
  costZar: number
  revenueZar: number
  leftZar: number
}

export interface Forecast {
  clients: ClientLine[]
  /** Today: paying clients' revenue against every running client's costs. */
  now: Scenario
  /** Once trials convert, prospects included when counted. */
  planned: Scenario
  mix: PerRun
}

interface Row { runs: number; perRun: PerRun | null; revenueZar: number }

function scenario(rows: readonly Row[], fixedZar: number, s: CostSettings): Scenario {
  const sum = (pick: (p: PerRun) => number) =>
    rows.reduce((acc, r) => acc + (r.perRun ? r.runs * pick(r.perRun) : 0), 0)
  const openaiUsd = sum((p) => p.openai) + s.extraOpenaiUsd
  const transcriptsUsd = sum((p) => p.transcripts)
  const apifyUsageUsd = sum((p) => p.apify) + s.extraApifyUsd
  const apifyUsd = Math.max(s.apifyPlanUsd, apifyUsageUsd)
  const usageZar = (openaiUsd + transcriptsUsd + apifyUsd) * s.usdZar
  const costZar = fixedZar + usageZar
  const revenueZar = rows.reduce((acc, r) => acc + r.revenueZar, 0)
  return {
    openaiUsd,
    transcriptsUsd,
    apifyUsageUsd,
    apifyUsd,
    apifyAtFloor: apifyUsageUsd < s.apifyPlanUsd,
    usageZar,
    fixedZar,
    costZar,
    revenueZar,
    leftZar: revenueZar - costZar,
  }
}

/**
 * The month ahead, two ways. NOW: every client that runs costs its runs, and
 * only paying clients bring revenue. PLANNED: trials have converted, and
 * prospects are in as if signed when `countProspects` is on. The fixed bills,
 * the OpenAI and Apify extras and Apify's floor sit in the totals, never in a
 * client's line.
 */
export function forecast(plans: readonly PlanInput[], fixedZar: number, settings: CostSettings): Forecast {
  const mix = mixOf(plans.flatMap((p) => (p.measured ? [p.measured] : [])))
  const now: Row[] = []
  const planned: Row[] = []
  const clients = plans.map((p): ClientLine => {
    const { perRun, source } = perRunFor(p.measured, p.overrideUsd, mix)
    const runsPerMonth = RUNS_PER_MONTH[p.cadence]
    const perRunUsd = perRun ? perRunTotal(perRun) : null
    const usageUsd = perRunUsd === null ? 0 : runsPerMonth * perRunUsd
    const usageZar = usageUsd * settings.usdZar
    const revenueZar = toZar(p.price, p.currency, settings)
    const inNow = p.stage !== 'prospect'
    const inPlanned = inNow || settings.countProspects
    if (inNow) now.push({ runs: runsPerMonth, perRun, revenueZar: p.stage === 'paying' ? revenueZar : 0 })
    if (inPlanned) planned.push({ runs: runsPerMonth, perRun, revenueZar })
    return {
      key: p.key,
      name: p.name,
      stage: p.stage,
      cadence: p.cadence,
      runsPerMonth,
      perRunUsd,
      perRunSource: source,
      usageUsd,
      usageZar,
      revenueZar,
      leftNowZar: inNow ? (p.stage === 'paying' ? revenueZar : 0) - usageZar : null,
      leftPlannedZar: inPlanned ? revenueZar - usageZar : null,
    }
  })
  return { clients, now: scenario(now, fixedZar, settings), planned: scenario(planned, fixedZar, settings), mix }
}

// ---- OpenAI's prepaid credit -----------------------------------------------------

export interface RunwayInput {
  balanceUsd: number | null
  /** The day the balance was read. */
  balanceOn: string | null
  today: string
  /** OpenAI spend the pipeline logged since that day began (ai_call_log). */
  trackedSinceUsd: number
  /** The month's OpenAI burn the forecast expects, extras included. */
  monthlyBurnUsd: number
  /** The part of it no log sees (gbrain and tests on the same key). */
  extraMonthlyUsd: number
}

export interface Runway {
  /** `unknown`: no balance entered. `out`: spent. `idle`: nothing burns it. */
  state: 'unknown' | 'out' | 'ok' | 'idle'
  remainingUsd: number
  /** The extras' share since the balance was read: spent, but in no log. */
  untrackedSinceUsd: number
  dailyBurnUsd: number
  daysLeft: number | null
  runsOutOn: string | null
}

/**
 * When the prepaid credit runs out: the balance as read, less what the log
 * shows spent since that day began and the extras' daily share since, burned
 * at the forecast's daily rate. Counting from the start of the day errs early,
 * which is the safe side for a balance that has run dry twice.
 */
export function openaiRunway(i: RunwayInput): Runway {
  const dailyBurnUsd = Math.max(0, i.monthlyBurnUsd) / DAYS_PER_MONTH
  if (i.balanceUsd === null || !i.balanceOn) {
    return { state: 'unknown', remainingUsd: 0, untrackedSinceUsd: 0, dailyBurnUsd, daysLeft: null, runsOutOn: null }
  }
  const daysSince = Math.max(0, daysBetween(i.balanceOn, i.today))
  const untrackedSinceUsd = (i.extraMonthlyUsd * daysSince) / DAYS_PER_MONTH
  const remainingUsd = i.balanceUsd - i.trackedSinceUsd - untrackedSinceUsd
  if (remainingUsd <= 0) {
    return { state: 'out', remainingUsd, untrackedSinceUsd, dailyBurnUsd, daysLeft: 0, runsOutOn: i.today }
  }
  if (dailyBurnUsd <= 0) {
    return { state: 'idle', remainingUsd, untrackedSinceUsd, dailyBurnUsd, daysLeft: null, runsOutOn: null }
  }
  const daysLeft = Math.floor(remainingUsd / dailyBurnUsd)
  return { state: 'ok', remainingUsd, untrackedSinceUsd, dailyBurnUsd, daysLeft, runsOutOn: addDays(i.today, daysLeft) }
}

// ---- Apify against its cap -------------------------------------------------------

export interface Pace {
  spentUsd: number
  /** This cycle's spend if it carries on at the rate so far. */
  projectedUsd: number
  capUsd: number
  /** The projection as a share of the cap (1 = the cap). */
  shareOfCap: number
  /** The day the cap is reached at this rate, or null if it is not. Today
   *  once it has been. */
  capHitOn: string | null
}

export function apifyPace(spentUsd: number, cycle: Cycle, capUsd: number, today: string): Pace {
  const days = Math.max(1, cycle.daysElapsed)
  const daily = spentUsd / days
  const projectedUsd = daily * cycle.daysInCycle
  let capHitOn: string | null = null
  if (capUsd > 0 && spentUsd >= capUsd) capHitOn = today
  else if (capUsd > 0 && daily > 0 && projectedUsd > capUsd) {
    const hit = addDays(cycle.start, Math.floor(capUsd / daily))
    capHitOn = hit < cycle.next ? hit : null
  }
  return { spentUsd, projectedUsd, capUsd, shareOfCap: capUsd > 0 ? projectedUsd / capUsd : 0, capHitOn }
}

// ---- What is owed ----------------------------------------------------------------

/** Failed charges still owed, in rand. */
export function owedByYouZar(bills: readonly Bill[], settings: CostSettings): number {
  return bills.reduce((s, b) => s + toZar(b.overdueAmount, b.currency, settings), 0)
}

/** Unpaid client invoices, in rand. */
export function owedToYouZar(plans: readonly { unpaidAmount: number; currency: Currency }[], settings: CostSettings): number {
  return plans.reduce((s, p) => s + toZar(p.unpaidAmount, p.currency, settings), 0)
}
