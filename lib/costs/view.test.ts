import { describe, expect, it } from 'vitest'
import { billingCycle } from './dates'
import type { ClientInfo, CostsData } from './load'
import { billFromRow, planFromRow, settingsFromRow } from './rows'
import { DEFAULT_SETTINGS, type ClientPlan } from './types'
import { buildCostsView, planViews } from './view'

const OSSUR: ClientInfo = { id: 'o', name: 'Össur', isActive: true, trialEndsAt: null, reportPeriod: 'weekly' }
const SEALAND: ClientInfo = { id: 's', name: 'Sealand', isActive: true, trialEndsAt: null, reportPeriod: 'weekly' }

const plan = (over: Partial<ClientPlan>): ClientPlan => ({
  id: 'p', clientId: null, name: null, stage: 'paying', price: 0, currency: 'USD', unpaidAmount: 0,
  note: null, trialEndsOn: null, cadence: null, costPerRunUsd: null, ...over,
})

const SEED_PLANS = [
  plan({ id: 'po', clientId: 'o', stage: 'paying', price: 205, unpaidAmount: 1025 }),
  plan({ id: 'ps', clientId: 's', stage: 'trial', price: 3500, currency: 'ZAR', trialEndsOn: '2026-10-13' }),
]

const MEASURED = [
  { clientId: 'o', runs: 3, perRun: { openai: 4.15, transcripts: 0.19, apify: 6.96 }, lastRunAt: null },
  { clientId: 's', runs: 3, perRun: { openai: 7.28, transcripts: 0.36, apify: 10.89 }, lastRunAt: null },
]

describe('the client plans', () => {
  it('reads cadence from the schedule unless the plan sets one', () => {
    const v = planViews({ clients: [OSSUR, SEALAND], plans: [SEED_PLANS[0], { ...SEED_PLANS[1], cadence: 'fortnightly' }], measured: MEASURED, today: '2026-10-09' })
    expect(v.map((p) => [p.name, p.cadence, p.cadenceSource])).toEqual([
      ['Össur', 'weekly', 'schedule'],
      ['Sealand', 'fortnightly', 'plan'],
    ])
    expect(v[1]).toMatchObject({ stage: 'trial', trialEndsOn: '2026-10-13', trialSource: 'plan' })
    expect(v[0].measured?.perRun.apify).toBe(6.96)
  })

  it('plans a client with no row from what the app knows', () => {
    const trial = { ...OSSUR, trialEndsAt: '2026-11-01', reportPeriod: 'paused' }
    const [v] = planViews({ clients: [trial], plans: [], measured: [], today: '2026-10-09' })
    expect(v).toMatchObject({ key: 'client:o', planId: null, stage: 'trial', price: 0, cadence: 'none', trialSource: 'app' })
    const [lapsed] = planViews({ clients: [{ ...trial, trialEndsAt: '2026-10-01' }], plans: [], measured: [], today: '2026-10-09' })
    expect(lapsed.stage).toBe('paying')
  })

  it('leaves out an inactive client with no plan, and adds prospects last', () => {
    const v = planViews({
      clients: [{ ...OSSUR, isActive: false }, SEALAND],
      plans: [plan({ id: 'pp', name: 'Acme', stage: 'prospect', cadence: 'monthly', costPerRunUsd: 12 })],
      measured: [],
      today: '2026-10-09',
    })
    expect(v.map((p) => [p.name, p.stage])).toEqual([['Sealand', 'paying'], ['Acme', 'prospect']])
    expect(v[1]).toMatchObject({ clientId: null, overrideUsd: 12, cadence: 'monthly' })
  })
})

describe('the page, decided', () => {
  const data: CostsData = {
    today: '2026-10-09',
    bills: [
      billFromRow({ id: 'a', name: 'Apify Starter', amount: '72.37', currency: 'USD', cadence: 'monthly', next_charge_on: '2026-11-09', status: 'failing', overdue_amount: '72.37', usage_tracked: true }),
      billFromRow({ id: 'b', name: 'Supabase Pro', amount: 25, currency: 'USD', cadence: 'monthly', next_charge_on: '2026-10-16', status: 'active', overdue_amount: 0 }),
    ],
    plans: SEED_PLANS,
    settings: { ...DEFAULT_SETTINGS, openaiBalanceUsd: 20, openaiBalanceOn: '2026-10-09' },
    clients: [OSSUR, SEALAND],
    measured: MEASURED,
    usage: [],
    recentRuns: [],
    apifyCycle: billingCycle('2026-10-09', 9),
    apifyCycleSpendUsd: 2,
    openaiSinceBalanceUsd: 0,
  }
  const v = buildCostsView(data)

  it('puts the fixed bills, the calendar and what is owed together', () => {
    expect(v.fixed.lines.map((l) => l.name)).toEqual(['Supabase Pro'])
    expect(v.upcoming.map((c) => `${c.date} ${c.name}`)).toEqual([
      '2026-10-16 Supabase Pro', '2026-11-09 Apify Starter', '2026-11-16 Supabase Pro',
    ])
    expect(v.owedByYouZar).toBeCloseTo(72.37 * 16.62, 6)
    expect(v.owedToYouZar).toBeCloseTo(1025 * 16.62, 6)
  })

  it('burns the credit at today\'s clients\' OpenAI and Whisper rate', () => {
    expect(v.openaiMonthlyBurnUsd).toBeCloseTo((52 / 12) * (4.15 + 7.28 + 0.19 + 0.36) + 17, 6)
    expect(v.runway.state).toBe('ok')
    expect(v.runway.daysLeft).toBe(Math.floor(20 / v.runway.dailyBurnUsd))
  })

  it('compares Apify\'s cycle with the cap and with the plan', () => {
    expect(v.pace.spentUsd).toBe(2)
    expect(v.pace.projectedUsd).toBe(62)
    expect(v.apifyPlannedUsd).toBeCloseTo((52 / 12) * (6.96 + 10.89) + 7.5, 6)
  })
})

describe('reading the rows', () => {
  it('reads numerics that arrive as strings, and a missing settings row as the defaults', () => {
    expect(planFromRow({ id: 'x', client_id: null, name: 'Acme', stage: 'prospect', price: '300.00', currency: 'USD', unpaid_amount: '0', cost_per_run_usd: '15.50' }))
      .toMatchObject({ price: 300, costPerRunUsd: 15.5, cadence: null })
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromRow({ usd_zar: '17.1', count_shared: false, apify_cycle_day: 9 })).toMatchObject({ usdZar: 17.1, countShared: false })
  })
})
