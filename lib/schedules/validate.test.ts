import { describe, expect, it } from 'vitest'
import { starterTemplate } from '../reports/templates'
import { QUARTERLY_STARTER_KEY } from './artefact'
import { CADENCES, cadenceWordOf } from './types'
import { CADENCE_NOT_STORED, isUnsupportedCadence, normaliseRecipients, recipientsSchema, scheduleInputSchema, splitRecipients } from './validate'

describe('recipients', () => {
  it('splits a pasted list on commas, semicolons, newlines and spaces', () => {
    expect(splitRecipients('a@x.com, b@x.com;c@x.com\nd@x.com e@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com'])
    expect(splitRecipients('')).toEqual([])
  })
  it('lower-cases and dedupes, keeping first-seen order', () => {
    expect(normaliseRecipients([' Malori@Ossur.com', 'anne@ossur.com', 'malori@ossur.com '])).toEqual(['malori@ossur.com', 'anne@ossur.com'])
  })
  it('rejects a non-address and more than the cap', () => {
    expect(recipientsSchema.safeParse(['not an email']).success).toBe(false)
    const many = Array.from({ length: 26 }, (_, i) => `p${i}@x.com`)
    expect(recipientsSchema.safeParse(many).success).toBe(false)
    expect(recipientsSchema.safeParse(many.slice(0, 25)).success).toBe(true)
  })
})

describe('scheduleInputSchema', () => {
  const base = { name: 'Weekly digest', cadence: 'every_update', recipients: ['a@x.com'], attachPdf: true, shareDays: 30, active: true }
  it('takes exactly one template — a starter key or a report id', () => {
    expect(scheduleInputSchema.safeParse({ ...base, starterKey: 'weekly_digest' }).success).toBe(true)
    expect(scheduleInputSchema.safeParse({ ...base, reportId: '4f6c4a1c-2b2f-4d1a-9d3a-3e3f9a1b2c3d' }).success).toBe(true)
    expect(scheduleInputSchema.safeParse({ ...base }).success).toBe(false)
    expect(scheduleInputSchema.safeParse({ ...base, starterKey: 'weekly_digest', reportId: '4f6c4a1c-2b2f-4d1a-9d3a-3e3f9a1b2c3d' }).success).toBe(false)
  })
  it('review defaults to off and round-trips on', () => {
    expect(scheduleInputSchema.parse({ ...base, starterKey: 'weekly_digest' }).review).toBe(false)
    expect(scheduleInputSchema.parse({ ...base, starterKey: 'weekly_digest', review: true }).review).toBe(true)
  })
  it('share-link life is 7, 30, 90 or never', () => {
    expect(scheduleInputSchema.safeParse({ ...base, starterKey: 'weekly_digest', shareDays: null }).success).toBe(true)
    expect(scheduleInputSchema.safeParse({ ...base, starterKey: 'weekly_digest', shareDays: 14 }).success).toBe(false)
  })
})

describe('the quarterly cadence', () => {
  it('is offered by the picker and accepted by the Studio’s own routes', () => {
    // WP16 filtered it out of CADENCES and refused it here, with a comment
    // saying the picker gains it with the review that fills it — WP20 is that
    // review. Until this, a quarterly schedule created through Settings could
    // not afterwards be edited in the Studio at all.
    expect(CADENCES.map((c) => c.key)).toContain('quarterly')
    const parsed = scheduleInputSchema.safeParse({
      name: 'Quarterly review',
      starterKey: QUARTERLY_STARTER_KEY,
      reportId: null,
      cadence: 'quarterly',
      recipients: ['someone@example.com'],
      attachPdf: true,
      shareDays: 30,
      active: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('resolves the starter it is created under, so editing it is not refused', () => {
    // app/dashboard/studio/actions.ts refuses an unknown starter with "Pick a
    // template."; lib/reports/templates.ts says the weekly entry exists to
    // prevent exactly that, and QUARTERLY_STARTER_KEY had no entry.
    expect(starterTemplate(QUARTERLY_STARTER_KEY)?.artefact).toBe(true)
  })
})

// M8 widens `report_schedules_cadence_check` to accept 'quarterly' and is
// authored, not applied — so the Studio's picker offers a cadence the schema
// still refuses, and "Could not save that. Try again." asks for a retry that
// cannot succeed. This is the predicate that tells that failure apart.
describe('isUnsupportedCadence', () => {
  const check = (over: Record<string, unknown> = {}) => ({
    code: '23514',
    message: 'new row for relation "report_schedules" violates check constraint "report_schedules_cadence_check"',
    details: null,
    ...over,
  })

  it('recognises the cadence CHECK refusing the value', () => {
    expect(isUnsupportedCadence(check())).toBe(true)
    expect(isUnsupportedCadence(check({ message: 'violates check constraint', details: 'report_schedules_cadence_check' }))).toBe(true)
  })

  it('is not every check violation, and not every error', () => {
    expect(isUnsupportedCadence(check({ message: 'violates check constraint "report_schedules_one_source"' }))).toBe(false)
    expect(isUnsupportedCadence({ code: '23505', message: 'report_schedules_cadence_check' })).toBe(false)
    expect(isUnsupportedCadence(null)).toBe(false)
    expect(isUnsupportedCadence('nope')).toBe(false)
  })

  it('says what has not shipped rather than asking for a retry', () => {
    expect(CADENCE_NOT_STORED).toContain('has not shipped')
    expect(CADENCE_NOT_STORED).not.toContain('Try again')
  })
})

// THREE CADENCES, THREE WORDS. Three call sites each wrote
// `cadence === 'monthly' ? 'monthly' : 'weekly'`, so a quarterly schedule's
// subject line called itself weekly.
describe('cadenceWordOf', () => {
  it('gives every cadence its own word', () => {
    expect(cadenceWordOf('every_update')).toBe('weekly')
    expect(cadenceWordOf('monthly')).toBe('monthly')
    expect(cadenceWordOf('quarterly')).toBe('quarterly')
  })

  it('covers every cadence the picker offers, so a new one cannot default away', () => {
    for (const c of CADENCES) expect(cadenceWordOf(c.key)).not.toBe('')
    expect(CADENCES.map((c) => cadenceWordOf(c.key))).toEqual(['weekly', 'monthly', 'quarterly'])
  })

  it('falls back to the update rhythm for a row that says nothing', () => {
    expect(cadenceWordOf(null)).toBe('weekly')
    expect(cadenceWordOf(undefined)).toBe('weekly')
    expect(cadenceWordOf('fortnightly')).toBe('weekly')
  })
})
