import { describe, expect, it } from 'vitest'
import { billingCycle } from './dates'
import {
  apifyPace, cadenceFromSchedule, countsAsFixed, fixedCosts, forecast, mixOf, monthlyEquivalent,
  openaiRunway, owedByYouZar, owedToYouZar, perRunFor, RUNS_PER_MONTH, FALLBACK_MIX, DAYS_PER_MONTH,
  type PlanInput,
} from './forecast'
import { DEFAULT_SETTINGS, type Bill, type CostSettings } from './types'

const S: CostSettings = DEFAULT_SETTINGS

const bill = (over: Partial<Bill>): Bill => ({
  id: over.slug ?? over.name ?? 'b',
  slug: null,
  name: 'Bill',
  what: null,
  category: null,
  amount: 0,
  currency: 'USD',
  cadence: 'monthly',
  nextChargeOn: null,
  anchorDay: null,
  status: 'active',
  overdueAmount: 0,
  paymentMethod: null,
  notes: null,
  isEstimate: false,
  shared: false,
  usageTracked: false,
  manageUrl: null,
  lastPaidOn: null,
  ...over,
})

// The seed of 9 Oct 2026, as far as the forecast is concerned.
const SEED: Bill[] = [
  bill({ name: 'Apify Starter', amount: 72.37, status: 'failing', overdueAmount: 72.37, usageTracked: true }),
  bill({ name: 'AssemblyAI', amount: null, cadence: 'usage', usageTracked: true }),
  bill({ name: 'Google Workspace', amount: 14, currency: 'EUR' }),
  bill({ name: 'Inngest', amount: null }),
  bill({ name: 'OpenAI API', amount: 90, cadence: 'usage', usageTracked: true }),
  bill({ name: 'Resend', amount: null }),
  bill({ name: 'Supabase Pro', amount: 25 }),
  bill({ name: 'Vercel Hobby', amount: 0, status: 'watch' }),
  bill({ name: 'verbatimintel.com', amount: 848.7, currency: 'ZAR', cadence: 'two_yearly' }),
  bill({ name: 'Claude Max 5x', amount: 115, status: 'watch', shared: true }),
]

// Össur and Sealand's last three full runs, as cost_per_run_by_client read
// them from production on 9 Oct 2026.
const OSSUR = { openai: 4.15, transcripts: 0.19, apify: 6.96 }
const SEALAND = { openai: 7.28, transcripts: 0.36, apify: 10.89 }

const PLANS: PlanInput[] = [
  { key: 'o', name: 'Össur', stage: 'paying', price: 205, currency: 'USD', cadence: 'weekly', measured: OSSUR, overrideUsd: null },
  { key: 's', name: 'Sealand', stage: 'trial', price: 3500, currency: 'ZAR', cadence: 'weekly', measured: SEALAND, overrideUsd: null },
]

describe('the schedule as a cadence', () => {
  it('reads weekly and monthly as they are, and a pause or nothing as no runs', () => {
    expect(cadenceFromSchedule('weekly')).toBe('weekly')
    expect(cadenceFromSchedule('monthly')).toBe('monthly')
    expect(cadenceFromSchedule('paused')).toBe('none')
    expect(cadenceFromSchedule(null)).toBe('none')
  })

  it('runs 52 weeks or 26 fortnights a year, over twelve months', () => {
    expect(RUNS_PER_MONTH.weekly).toBeCloseTo(4.333, 3)
    expect(RUNS_PER_MONTH.fortnightly).toBeCloseTo(2.167, 3)
    expect(RUNS_PER_MONTH.monthly).toBe(1)
    expect(RUNS_PER_MONTH.none).toBe(0)
  })
})

describe('fixed bills as a month', () => {
  it('takes a twelfth of a yearly bill and a twenty-fourth of a two-yearly one', () => {
    expect(monthlyEquivalent(120, 'yearly')).toBe(10)
    expect(monthlyEquivalent(848.7, 'two_yearly')).toBeCloseTo(35.3625, 4)
    expect(monthlyEquivalent(25, 'monthly')).toBe(25)
    expect(monthlyEquivalent(null, 'monthly')).toBe(0)
  })

  it('leaves out what usage covers, what no longer charges, and shared bills when they are not counted', () => {
    expect(countsAsFixed(bill({ usageTracked: true }), S)).toBe(false)
    expect(countsAsFixed(bill({ status: 'ended' }), S)).toBe(false)
    expect(countsAsFixed(bill({ status: 'paused' }), S)).toBe(false)
    expect(countsAsFixed(bill({ status: 'failing' }), S)).toBe(true)
    expect(countsAsFixed(bill({ shared: true }), S)).toBe(true)
    expect(countsAsFixed(bill({ shared: true }), { countShared: false })).toBe(false)
  })

  it('totals the seed: Supabase, Workspace, Claude Max and the domain, in rand', () => {
    const f = fixedCosts(SEED, S)
    // 25 × 16.62 + 14 × 18.63 + 115 × 16.62 + 848.70 / 24
    expect(f.totalZar).toBeCloseTo(415.5 + 260.82 + 1911.3 + 35.3625, 4)
    expect(f.lines[0].name).toBe('Claude Max 5x')
    expect(f.lines.map((l) => l.name)).not.toContain('Apify Starter')
    expect(f.lines.map((l) => l.name)).not.toContain('OpenAI API')
    expect(f.lines.map((l) => l.name)).not.toContain('AssemblyAI')
    expect(f.lines.find((l) => l.name === 'Inngest')?.unknown).toBe(true)
  })

  it('drops Claude Max when shared bills are not counted', () => {
    expect(fixedCosts(SEED, { ...S, countShared: false }).totalZar).toBeCloseTo(415.5 + 260.82 + 35.3625, 4)
  })
})

describe('cost per run', () => {
  it('pools the measured runs into a vendor mix', () => {
    const mix = mixOf([OSSUR, SEALAND])
    expect(mix.openai + mix.transcripts + mix.apify).toBeCloseTo(1, 10)
    expect(mix.apify).toBeCloseTo(17.85 / 29.83, 6)
  })

  it('falls back to the mix of 9 Oct with nothing measured', () => {
    expect(mixOf([])).toEqual(FALLBACK_MIX)
  })

  it('splits a typed override by the mix, and prefers it to the measured average', () => {
    const r = perRunFor(OSSUR, 20, FALLBACK_MIX)
    expect(r.source).toBe('override')
    expect(r.perRun?.apify).toBeCloseTo(12, 10)
    expect(perRunFor(OSSUR, null, FALLBACK_MIX)).toEqual({ perRun: OSSUR, source: 'measured' })
    expect(perRunFor(null, null, FALLBACK_MIX)).toEqual({ perRun: null, source: 'none' })
  })
})

describe('the month ahead', () => {
  const weekly = 52 / 12
  const f = forecast(PLANS, fixedCosts(SEED, S).totalZar, S)
  const fixedZar = 415.5 + 260.82 + 1911.3 + 35.3625

  it('prices each client: Össur at $11.30 a run, Sealand at $18.53', () => {
    const [o, s] = f.clients
    expect(o.perRunUsd).toBeCloseTo(11.3, 6)
    expect(s.perRunUsd).toBeCloseTo(18.53, 6)
    expect(o.usageUsd).toBeCloseTo(weekly * 11.3, 6)
    expect(o.revenueZar).toBeCloseTo(205 * 16.62, 6)
    expect(o.leftNowZar).toBeCloseTo(205 * 16.62 - weekly * 11.3 * 16.62, 6)
  })

  it('counts a trial\'s runs today and its revenue only once it converts', () => {
    const s = f.clients[1]
    expect(s.leftNowZar).toBeCloseTo(-weekly * 18.53 * 16.62, 6)
    expect(s.leftPlannedZar).toBeCloseTo(3500 - weekly * 18.53 * 16.62, 6)
    expect(f.now.revenueZar).toBeCloseTo(205 * 16.62, 6)
    expect(f.planned.revenueZar).toBeCloseTo(205 * 16.62 + 3500, 6)
  })

  it('adds the extras to usage: $17 of OpenAI and $7.50 of Apify', () => {
    expect(f.now.openaiUsd).toBeCloseTo(weekly * (4.15 + 7.28) + 17, 6)
    expect(f.now.transcriptsUsd).toBeCloseTo(weekly * (0.19 + 0.36), 6)
    expect(f.now.apifyUsageUsd).toBeCloseTo(weekly * (6.96 + 10.89) + 7.5, 6)
    expect(f.now.apifyUsd).toBe(f.now.apifyUsageUsd)
    expect(f.now.apifyAtFloor).toBe(false)
  })

  it('totals cost and what is left over, now and once Sealand converts', () => {
    const usageUsd = weekly * (4.15 + 7.28) + 17 + weekly * (0.19 + 0.36) + weekly * (6.96 + 10.89) + 7.5
    const cost = fixedZar + usageUsd * 16.62
    expect(f.now.costZar).toBeCloseTo(cost, 6)
    expect(f.now.leftZar).toBeCloseTo(205 * 16.62 - cost, 6)
    expect(f.planned.leftZar).toBeCloseTo(205 * 16.62 + 3500 - cost, 6)
    // Roughly R5,179 a month: short R1,771 today, R1,729 ahead once Sealand pays.
    expect(Math.round(f.now.costZar)).toBe(5179)
    expect(Math.round(f.now.leftZar)).toBe(-1771)
    expect(Math.round(f.planned.leftZar)).toBe(1729)
  })

  it('never bills Apify below its plan fee', () => {
    const idle = forecast(PLANS.map((p) => ({ ...p, cadence: 'none' as const })), 0, S)
    expect(idle.now.apifyUsageUsd).toBe(7.5)
    expect(idle.now.apifyUsd).toBe(29)
    expect(idle.now.apifyAtFloor).toBe(true)
    expect(idle.now.openaiUsd).toBe(17)
  })

  it('leaves a prospect out until prospects are counted, and then only the plan', () => {
    const prospect: PlanInput = { key: 'p', name: 'Prospect', stage: 'prospect', price: 300, currency: 'USD', cadence: 'fortnightly', measured: null, overrideUsd: 15 }
    const off = forecast([...PLANS, prospect], 0, S)
    expect(off.clients[2].leftNowZar).toBeNull()
    expect(off.clients[2].leftPlannedZar).toBeNull()
    expect(off.planned.revenueZar).toBeCloseTo(205 * 16.62 + 3500, 6)

    const on = forecast([...PLANS, prospect], 0, { ...S, countProspects: true })
    expect(on.clients[2].leftNowZar).toBeNull()
    expect(on.clients[2].perRunSource).toBe('override')
    expect(on.clients[2].usageUsd).toBeCloseTo((26 / 12) * 15, 6)
    expect(on.planned.revenueZar).toBeCloseTo(205 * 16.62 + 3500 + 300 * 16.62, 6)
    expect(on.now.revenueZar).toBeCloseTo(off.now.revenueZar, 6)
    expect(on.planned.costZar).toBeGreaterThan(off.planned.costZar)
  })

  it('prices a client with no measured runs and no override at nothing, and says so', () => {
    const r = forecast([{ ...PLANS[0], measured: null }], 0, S)
    expect(r.clients[0].perRunSource).toBe('none')
    expect(r.clients[0].usageUsd).toBe(0)
  })
})

describe('the OpenAI credit runway', () => {
  const base = { balanceUsd: 30, balanceOn: '2026-10-01', today: '2026-10-09', trackedSinceUsd: 12, monthlyBurnUsd: 2 * DAYS_PER_MONTH, extraMonthlyUsd: DAYS_PER_MONTH }

  it('takes off what was logged and the extras\' share since the balance was read', () => {
    const r = openaiRunway(base)
    expect(r.state).toBe('ok')
    expect(r.untrackedSinceUsd).toBeCloseTo(8, 10)
    expect(r.remainingUsd).toBeCloseTo(10, 10)
    expect(r.dailyBurnUsd).toBeCloseTo(2, 10)
    expect(r.daysLeft).toBe(5)
    expect(r.runsOutOn).toBe('2026-10-14')
  })

  it('says unknown with no balance, out when spent, idle when nothing burns it', () => {
    expect(openaiRunway({ ...base, balanceUsd: null }).state).toBe('unknown')
    expect(openaiRunway({ ...base, balanceOn: null }).state).toBe('unknown')
    const out = openaiRunway({ ...base, trackedSinceUsd: 40 })
    expect(out.state).toBe('out')
    expect(out.runsOutOn).toBe('2026-10-09')
    expect(openaiRunway({ ...base, monthlyBurnUsd: 0, extraMonthlyUsd: 0 }).state).toBe('idle')
  })

  it('never counts the days before the balance was read', () => {
    expect(openaiRunway({ ...base, balanceOn: '2026-10-20' }).untrackedSinceUsd).toBe(0)
  })
})

describe('Apify against its cap', () => {
  it('projects the cycle at the rate so far and dates the cap', () => {
    const cycle = billingCycle('2026-10-18', 9)
    const p = apifyPace(100, cycle, 200, '2026-10-18')
    expect(cycle.daysElapsed).toBe(10)
    expect(cycle.daysInCycle).toBe(31)
    expect(p.projectedUsd).toBeCloseTo(310, 10)
    expect(p.shareOfCap).toBeCloseTo(1.55, 10)
    expect(p.capHitOn).toBe('2026-10-29')
  })

  it('names no day when the pace stays under the cap, and today once it is reached', () => {
    const cycle = billingCycle('2026-10-18', 9)
    expect(apifyPace(30, cycle, 200, '2026-10-18').capHitOn).toBeNull()
    expect(apifyPace(210, cycle, 200, '2026-10-18').capHitOn).toBe('2026-10-18')
    expect(apifyPace(0, billingCycle('2026-10-09', 9), 200, '2026-10-09').projectedUsd).toBe(0)
  })
})

describe('what is owed', () => {
  it('sums failed charges and unpaid invoices in rand', () => {
    expect(owedByYouZar(SEED, S)).toBeCloseTo(72.37 * 16.62, 6)
    expect(owedToYouZar([{ unpaidAmount: 1025, currency: 'USD' }, { unpaidAmount: 0, currency: 'ZAR' }], S)).toBeCloseTo(1025 * 16.62, 6)
  })
})
