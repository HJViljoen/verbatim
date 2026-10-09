import { anchorDayOf } from './dates'
import { parseAmount } from './money'
import {
  BILL_CADENCES, BILL_STATUSES, CURRENCIES, RUN_CADENCES,
  type BillCadence, type BillStatus, type Currency, type RunCadence, type Stage,
} from './types'

// What the Costs page's forms post, read and checked before anything is
// written (lib/costs/forms.test.ts). Every enum is the migration's CHECK, so a
// value that passes here is one the database takes. Pure.

/** A FormData, or anything that reads like one. */
export interface FormLike { get(name: string): FormDataEntryValue | null }

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

const text = (f: FormLike, k: string, max = 4000): string | null => {
  const v = String(f.get(k) ?? '').trim()
  return v === '' ? null : v.slice(0, max)
}

const flag = (f: FormLike, k: string): boolean => {
  const v = f.get(k)
  return v === 'on' || v === 'true' || v === '1'
}

function oneOf<T extends string>(f: FormLike, k: string, list: readonly T[]): T | null {
  const v = String(f.get(k) ?? '')
  return (list as readonly string[]).includes(v) ? (v as T) : null
}

/** A 'YYYY-MM-DD' that is a real day, or null when blank; undefined when it
 *  is not a day at all. */
function day(f: FormLike, k: string): string | null | undefined {
  const v = String(f.get(k) ?? '').trim()
  if (v === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined
}

/** A link a bill's name may point at: http(s) only, so nothing typed here
 *  becomes a `javascript:` href. */
function url(f: FormLike, k: string): string | null | undefined {
  const v = text(f, k, 500)
  if (v === null) return null
  return /^https?:\/\/[^\s]+$/i.test(v) ? v : undefined
}

const MAX_MONEY = 10_000_000

function money(f: FormLike, k: string): number | null | undefined {
  const n = parseAmount(f.get(k))
  if (n === null) return null
  return Number.isFinite(n) && n <= MAX_MONEY ? Math.round(n * 100) / 100 : undefined
}

// ---- A bill ----------------------------------------------------------------------

export interface BillFields {
  name: string
  what: string | null
  category: string | null
  amount: number | null
  currency: Currency
  cadence: BillCadence
  nextChargeOn: string | null
  /** The day it charges on: the edited bill's own (posted as `anchorDay`)
   *  while the date still falls on it, else the date's day (lib/costs/dates.ts
   *  anchorDayOf). Null with no date. */
  anchorDay: number | null
  status: BillStatus
  overdueAmount: number
  paymentMethod: string | null
  notes: string | null
  isEstimate: boolean
  shared: boolean
  usageTracked: boolean
  manageUrl: string | null
}

/** The anchor day an edit form carries over, or null. */
function postedAnchor(f: FormLike): number | null {
  const n = Number(String(f.get('anchorDay') ?? '').trim() || NaN)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}

export function parseBillForm(f: FormLike): Parsed<BillFields> {
  const name = text(f, 'name', 120)
  if (!name) return { ok: false, message: 'Give the bill a name.' }
  const currency = oneOf(f, 'currency', CURRENCIES)
  if (!currency) return { ok: false, message: 'Pick a currency: USD, ZAR or EUR.' }
  const cadence = oneOf(f, 'cadence', BILL_CADENCES)
  if (!cadence) return { ok: false, message: 'Pick how often it charges.' }
  const status = oneOf(f, 'status', BILL_STATUSES)
  if (!status) return { ok: false, message: 'Pick a status.' }
  const amount = money(f, 'amount')
  if (amount === undefined) return { ok: false, message: 'The amount must be a number, like 25 or 848.70.' }
  const overdue = money(f, 'overdueAmount')
  if (overdue === undefined) return { ok: false, message: 'The overdue amount must be a number.' }
  const nextChargeOn = day(f, 'nextChargeOn')
  if (nextChargeOn === undefined) return { ok: false, message: 'The next charge date is not a date.' }
  const manageUrl = url(f, 'manageUrl')
  if (manageUrl === undefined) return { ok: false, message: 'The billing link must start with https://.' }
  return {
    ok: true,
    value: {
      name,
      what: text(f, 'what', 300),
      category: text(f, 'category', 60),
      amount,
      currency,
      cadence,
      nextChargeOn,
      anchorDay: nextChargeOn ? anchorDayOf(nextChargeOn, postedAnchor(f)) : null,
      status,
      overdueAmount: overdue ?? 0,
      paymentMethod: text(f, 'paymentMethod', 120),
      notes: text(f, 'notes'),
      isEstimate: flag(f, 'isEstimate'),
      shared: flag(f, 'shared'),
      usageTracked: flag(f, 'usageTracked'),
      manageUrl,
    },
  }
}

// ---- A client's plan, or a prospect ----------------------------------------------

export interface PlanFields {
  /** A prospect's name; null for a client, whose name is the workspace's. */
  name: string | null
  stage: Stage
  price: number
  currency: Currency
  unpaidAmount: number
  note: string | null
  trialEndsOn: string | null
  /** Null = follow the client's schedule. */
  cadence: RunCadence | null
  costPerRunUsd: number | null
}

/** A client's plan (`prospect: false`) or a prospect (`prospect: true`). A
 *  prospect has a name and must run on some rhythm to be worth planning; a
 *  client is paying or on trial, never a prospect. */
export function parsePlanForm(f: FormLike, opts: { prospect: boolean }): Parsed<PlanFields> {
  const name = opts.prospect ? text(f, 'name', 120) : null
  if (opts.prospect && !name) return { ok: false, message: 'Give the prospect a name.' }
  const stage: Stage | null = opts.prospect ? 'prospect' : oneOf(f, 'stage', ['paying', 'trial'] as const)
  if (!stage) return { ok: false, message: 'A client is paying or on trial.' }
  const currency = oneOf(f, 'currency', CURRENCIES)
  if (!currency) return { ok: false, message: 'Pick a currency: USD, ZAR or EUR.' }
  const price = money(f, 'price')
  if (price === undefined) return { ok: false, message: 'The price must be a number, like 205 or 3500.' }
  const unpaid = money(f, 'unpaidAmount')
  if (unpaid === undefined) return { ok: false, message: 'The unpaid amount must be a number.' }
  const trialEndsOn = day(f, 'trialEndsOn')
  if (trialEndsOn === undefined) return { ok: false, message: 'The trial end is not a date.' }
  const rawCadence = String(f.get('cadence') ?? '')
  const cadence = rawCadence === '' ? null : oneOf(f, 'cadence', RUN_CADENCES)
  if (rawCadence !== '' && !cadence) return { ok: false, message: 'Pick a run cadence.' }
  if (opts.prospect && cadence === null) return { ok: false, message: 'Pick how often the prospect would run.' }
  const costPerRun = money(f, 'costPerRunUsd')
  if (costPerRun === undefined) return { ok: false, message: 'The cost per run must be a number of dollars.' }
  return {
    ok: true,
    value: {
      name,
      stage,
      price: price ?? 0,
      currency,
      unpaidAmount: opts.prospect ? 0 : (unpaid ?? 0),
      note: text(f, 'note', 1000),
      trialEndsOn: stage === 'trial' ? trialEndsOn : null,
      cadence,
      costPerRunUsd: costPerRun,
    },
  }
}

// ---- The assumptions -------------------------------------------------------------

export interface SettingsFields {
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

export function parseSettingsForm(f: FormLike): Parsed<SettingsFields> {
  const nums = {
    usdZar: money(f, 'usdZar'),
    eurZar: money(f, 'eurZar'),
    extraOpenaiUsd: money(f, 'extraOpenaiUsd'),
    extraApifyUsd: money(f, 'extraApifyUsd'),
    apifyPlanUsd: money(f, 'apifyPlanUsd'),
    apifyCapUsd: money(f, 'apifyCapUsd'),
  }
  for (const [k, v] of Object.entries(nums)) {
    if (v === undefined || v === null) return { ok: false, message: `Fill in ${SETTING_LABEL[k as keyof typeof nums]} with a number.` }
  }
  if (!nums.usdZar || !nums.eurZar) return { ok: false, message: 'An exchange rate cannot be zero.' }
  const cycleDay = Number(String(f.get('apifyCycleDay') ?? '').trim())
  if (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 28) {
    return { ok: false, message: 'Apify’s cycle day is a day of the month from 1 to 28.' }
  }
  const balance = money(f, 'openaiBalanceUsd')
  if (balance === undefined) return { ok: false, message: 'The OpenAI balance must be a number of dollars.' }
  const balanceOn = day(f, 'openaiBalanceOn')
  if (balanceOn === undefined) return { ok: false, message: 'The balance date is not a date.' }
  if ((balance === null) !== (balanceOn === null)) {
    return { ok: false, message: 'Enter the OpenAI balance and the day you read it together.' }
  }
  return {
    ok: true,
    value: {
      usdZar: nums.usdZar as number,
      eurZar: nums.eurZar as number,
      extraOpenaiUsd: nums.extraOpenaiUsd as number,
      extraApifyUsd: nums.extraApifyUsd as number,
      apifyPlanUsd: nums.apifyPlanUsd as number,
      apifyCapUsd: nums.apifyCapUsd as number,
      apifyCycleDay: cycleDay,
      openaiBalanceUsd: balance,
      openaiBalanceOn: balanceOn,
      countShared: flag(f, 'countShared'),
      countProspects: flag(f, 'countProspects'),
    },
  }
}

const SETTING_LABEL = {
  usdZar: 'rand per dollar',
  eurZar: 'rand per euro',
  extraOpenaiUsd: 'the extra OpenAI spend',
  extraApifyUsd: 'the extra Apify spend',
  apifyPlanUsd: 'Apify’s plan fee',
  apifyCapUsd: 'Apify’s cap',
} as const
