import { describe, expect, it } from 'vitest'
import { parseBillForm, parsePlanForm, parseSettingsForm } from './forms'

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const BILL = {
  name: 'Supabase Pro',
  currency: 'USD',
  cadence: 'monthly',
  status: 'active',
  amount: '25',
  overdueAmount: '',
  nextChargeOn: '2026-10-16',
  manageUrl: 'https://supabase.com/dashboard',
}

describe('a bill form', () => {
  it('reads a whole bill', () => {
    const r = parseBillForm(form({ ...BILL, isEstimate: 'on', notes: '  about $31 this time  ' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({
      name: 'Supabase Pro', amount: 25, overdueAmount: 0, nextChargeOn: '2026-10-16',
      isEstimate: true, shared: false, usageTracked: false, notes: 'about $31 this time',
    })
  })

  it('keeps an unknown amount unknown and a blank date blank', () => {
    const r = parseBillForm(form({ ...BILL, amount: '', nextChargeOn: '' }))
    expect(r.ok && r.value.amount).toBeNull()
    expect(r.ok && r.value.nextChargeOn).toBeNull()
  })

  it('refuses what the database would', () => {
    expect(parseBillForm(form({ ...BILL, name: '  ' })).ok).toBe(false)
    expect(parseBillForm(form({ ...BILL, currency: 'GBP' })).ok).toBe(false)
    expect(parseBillForm(form({ ...BILL, cadence: 'weekly' })).ok).toBe(false)
    expect(parseBillForm(form({ ...BILL, status: 'late' })).ok).toBe(false)
    expect(parseBillForm(form({ ...BILL, amount: 'twenty' })).ok).toBe(false)
    expect(parseBillForm(form({ ...BILL, nextChargeOn: '2026-02-30' })).ok).toBe(false)
  })

  it('anchors a new bill on its date\'s day, and keeps an edited bill\'s day while the date still falls on it', () => {
    const fresh = parseBillForm(form({ ...BILL, nextChargeOn: '2026-10-31' }))
    expect(fresh.ok && fresh.value.anchorDay).toBe(31)
    const kept = parseBillForm(form({ ...BILL, nextChargeOn: '2026-11-30', anchorDay: '31' }))
    expect(kept.ok && kept.value.anchorDay).toBe(31)
    const moved = parseBillForm(form({ ...BILL, nextChargeOn: '2026-11-15', anchorDay: '31' }))
    expect(moved.ok && moved.value.anchorDay).toBe(15)
    const junk = parseBillForm(form({ ...BILL, nextChargeOn: '2026-11-30', anchorDay: '99' }))
    expect(junk.ok && junk.value.anchorDay).toBe(30)
    const undated = parseBillForm(form({ ...BILL, nextChargeOn: '', anchorDay: '31' }))
    expect(undated.ok && undated.value.anchorDay).toBeNull()
  })

  it('takes a billing link only over http(s)', () => {
    expect(parseBillForm(form({ ...BILL, manageUrl: 'javascript:alert(1)' })).ok).toBe(false)
    expect(parseBillForm(form({ ...BILL, manageUrl: '' })).ok).toBe(true)
  })
})

const PLAN = { stage: 'paying', currency: 'USD', price: '205', unpaidAmount: '$1,025', cadence: '', costPerRunUsd: '' }

describe('a client plan form', () => {
  it('reads a client that follows its schedule', () => {
    const r = parsePlanForm(form(PLAN), { prospect: false })
    expect(r.ok && r.value).toMatchObject({ name: null, stage: 'paying', price: 205, unpaidAmount: 1025, cadence: null, costPerRunUsd: null })
  })

  it('keeps a trial date only for a trial', () => {
    const trial = parsePlanForm(form({ ...PLAN, stage: 'trial', trialEndsOn: '2026-10-13' }), { prospect: false })
    expect(trial.ok && trial.value.trialEndsOn).toBe('2026-10-13')
    const paying = parsePlanForm(form({ ...PLAN, trialEndsOn: '2026-10-13' }), { prospect: false })
    expect(paying.ok && paying.value.trialEndsOn).toBeNull()
  })

  it('never makes a client a prospect', () => {
    expect(parsePlanForm(form({ ...PLAN, stage: 'prospect' }), { prospect: false }).ok).toBe(false)
  })

  it('needs a prospect\'s name and rhythm, and takes its cost per run', () => {
    expect(parsePlanForm(form({ ...PLAN, cadence: 'fortnightly' }), { prospect: true }).ok).toBe(false)
    expect(parsePlanForm(form({ ...PLAN, name: 'Acme' }), { prospect: true }).ok).toBe(false)
    const r = parsePlanForm(form({ ...PLAN, name: 'Acme', cadence: 'fortnightly', costPerRunUsd: '15' }), { prospect: true })
    expect(r.ok && r.value).toMatchObject({ name: 'Acme', stage: 'prospect', cadence: 'fortnightly', costPerRunUsd: 15, unpaidAmount: 0 })
  })
})

const SETTINGS = {
  usdZar: '16.62', eurZar: '18.63', extraOpenaiUsd: '17', extraApifyUsd: '7.50',
  apifyPlanUsd: '29', apifyCapUsd: '200', apifyCycleDay: '9', openaiBalanceUsd: '', openaiBalanceOn: '',
  countShared: 'on',
}

describe('the assumptions form', () => {
  it('reads the defaults, the toggles off when not posted', () => {
    const r = parseSettingsForm(form(SETTINGS))
    expect(r.ok && r.value).toMatchObject({ usdZar: 16.62, extraApifyUsd: 7.5, apifyCycleDay: 9, openaiBalanceUsd: null, countShared: true, countProspects: false })
  })

  it('needs the OpenAI balance and its day together', () => {
    expect(parseSettingsForm(form({ ...SETTINGS, openaiBalanceUsd: '12.40' })).ok).toBe(false)
    const r = parseSettingsForm(form({ ...SETTINGS, openaiBalanceUsd: '12.40', openaiBalanceOn: '2026-10-09' }))
    expect(r.ok && r.value).toMatchObject({ openaiBalanceUsd: 12.4, openaiBalanceOn: '2026-10-09' })
  })

  it('refuses a zero rate, a blank figure and a cycle day past the 28th', () => {
    expect(parseSettingsForm(form({ ...SETTINGS, usdZar: '0' })).ok).toBe(false)
    expect(parseSettingsForm(form({ ...SETTINGS, apifyCapUsd: '' })).ok).toBe(false)
    expect(parseSettingsForm(form({ ...SETTINGS, apifyCycleDay: '31' })).ok).toBe(false)
  })
})
